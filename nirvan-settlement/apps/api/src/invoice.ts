import { once } from "node:events";
import PDFDocument from "pdfkit";
import type { PrismaClient } from "@prisma/client";
import { formatAed } from "@nirvan/rules";
import { recordAudit } from "./audit.ts";
import type { AppConfig } from "./config.ts";
import { HttpError } from "./config.ts";
import { notify, type Mailer } from "./mailer.ts";
import { money } from "./money-db.ts";

const FEE_NOTE = "Stripe, payment, and Connect fees are borne by Nirvan Earth and are not deducted from this net.";

export async function ensureSettlementInvoice(
  db: PrismaClient,
  config: AppConfig,
  mailer: Mailer,
  input: {
    lineId: string;
    actorEmail: string;
    transferredAt?: Date;
  },
) {
  const existing = await db.settlementInvoice.findUnique({ where: { settlementLineId: input.lineId } });
  if (existing) return { invoice: existing, created: false };

  const line = await db.settlementLine.findUnique({
    where: { id: input.lineId },
    include: { vendor: true, pack: true, orderLines: true },
  });
  const reference = line?.stripeTransferId || line?.manualReference || "";
  if (!line || !reference) throw new HttpError(409, "A statement is created only after a transfer or a recorded manual payment.");
  const transferredAt = input.transferredAt ?? line.manualPaidAt ?? new Date();
  const number = await nextInvoiceNumber(db, line.pack.yearMonth, vendorCode(line.vendor));
  const invoice = await db.settlementInvoice.create({
    data: {
      number,
      settlementLineId: line.id,
      monthPackId: line.pack.id,
      vendorId: line.vendorId,
      amount: line.vendorNetSum,
      currency: "AED",
      stripeTransferId: reference,
      transferredAt,
    },
  });
  await recordAudit(db, "invoice.generated", input.actorEmail, {
    invoiceId: invoice.id,
    number,
    settlementLineId: line.id,
    transferId: reference,
  });
  const link = `${config.appUrl.replace(/\/+$/, "")}/api/lines/${line.id}/invoice`;
  const text = [
    `Payment advice ${number}`,
    `Vendor: ${line.vendor.name}`,
    `Period: ${line.pack.yearMonth}`,
    `Net paid: ${formatAed(money(line.vendorNetSum))}`,
    `Reference: ${reference}`,
    `Download: ${link}`,
    FEE_NOTE,
  ].join("\n");
  await notify(db, config, mailer, {
    action: "invoice.generated",
    actorEmail: input.actorEmail,
    subject: `Payment advice ${number}`,
    text,
  });
  if (line.vendor.email && line.vendor.email.toLowerCase() !== "admin@nirvanearth.com") {
    await db.emailMessage.create({
      data: {
        toEmail: line.vendor.email,
        subject: `Payment advice ${number}`,
        body: text,
        delivery: "blocked",
        providerMessageId: null,
      },
    });
    await recordAudit(db, "email.blocked", input.actorEmail, {
      subject: `Payment advice ${number}`,
      reason: "vendor_copy_not_sent",
    });
  }
  return { invoice, created: true };
}

export async function invoicePdfForLine(db: PrismaClient, lineId: string): Promise<{ filename: string; bytes: Buffer }> {
  const invoice = await db.settlementInvoice.findUnique({
    where: { settlementLineId: lineId },
    include: {
      vendor: true,
      pack: { include: { ruleVersion: true } },
      line: { include: { orderLines: { include: { order: true } } } },
    },
  });
  if (!invoice) throw new HttpError(404, "No payment advice for this line yet.");
  const orderLines = invoice.line.orderLines;
  const base = orderLines.reduce((sum, line) => sum + money(line.commissionBase), 0);
  const discount = orderLines.reduce((sum, line) => sum + money(line.discount), 0);
  const vat = orderLines.reduce((sum, line) => sum + money(line.vendorVat), 0);
  const commission = orderLines.reduce((sum, line) => sum + money(line.commissionAmount), 0);
  const adjustments = await db.adjustment.aggregate({
    where: { orderLineId: { in: orderLines.map((line) => line.id) }, status: "resolved" },
    _sum: { amount: true },
  });
  const payload = invoice.pack.ruleVersion?.payload as { commissionRate?: number; rulesVersion?: string } | null;
  const rate = typeof payload?.commissionRate === "number" ? payload.commissionRate : 0.2;
  const bytes = await renderAdvicePdf({
    number: invoice.number,
    period: invoice.pack.yearMonth,
    vendorName: invoice.vendor.name,
    webkulId: invoice.vendor.webkulSellerId || invoice.vendor.externalKey || "—",
    vatRegistered: invoice.vendor.vatRegistered,
    base,
    discount,
    commission,
    rate,
    rulesVersion: payload?.rulesVersion || "2026-10-28",
    vat,
    adjustments: money(adjustments._sum.amount ?? 0),
    net: money(invoice.amount),
    transferId: invoice.stripeTransferId,
    transferredAt: invoice.transferredAt,
    lines: orderLines.map((line) => ({
      orderNumber: line.order?.orderNumber ?? line.shopifyOrderId,
      title: line.title,
      base: money(line.commissionBase),
      commission: money(line.commissionAmount),
      vat: money(line.vendorVat),
      net: money(line.vendorNet),
    })),
  });
  if (bytes.length === 0) throw new HttpError(500, "Payment advice PDF was empty.");
  return { filename: `${invoice.number}.pdf`, bytes };
}

async function nextInvoiceNumber(db: PrismaClient, yearMonth: string, code: string): Promise<string> {
  const prefix = `NE-SA-${yearMonth}-${code}-`;
  const existing = await db.settlementInvoice.count({
    where: { number: { startsWith: prefix } },
  });
  return `${prefix}${String(existing + 1).padStart(3, "0")}`;
}

function vendorCode(vendor: { externalKey: string | null; webkulSellerId: string | null; name: string }): string {
  const raw = vendor.externalKey || vendor.webkulSellerId || vendor.name;
  const code = raw.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 16);
  return code || "vendor";
}

interface AdviceLine {
  orderNumber: string;
  title: string;
  base: number;
  commission: number;
  vat: number;
  net: number;
}

const INK = "#1A1A1A";
const FOREST = "#1B3A2F";
const SAND = "#F3EFE6";
const RULE = "#D9D3C7";
const MUTED = "#5C584F";
const PAPER = "#FFFcf7";

function renderAdvicePdf(input: {
  number: string;
  period: string;
  vendorName: string;
  webkulId: string;
  vatRegistered: boolean;
  base: number;
  discount: number;
  commission: number;
  rate: number;
  rulesVersion: string;
  vat: number;
  adjustments: number;
  net: number;
  transferId: string;
  transferredAt: Date;
  lines: AdviceLine[];
}): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = once(doc, "end").then(() => Buffer.concat(chunks));

  const pageWidth = doc.page.width;
  const pageHeight = doc.page.height;
  const left = 40;
  const right = pageWidth - 40;
  const width = right - left;
  const connectTransfer = input.transferId.startsWith("tr_");

  doc.rect(0, 0, pageWidth, pageHeight).fill(PAPER);
  doc.rect(0, 0, pageWidth, 112).fill(FOREST);
  doc.fillColor(SAND).font("Times-Bold").fontSize(26).text("Payment advice", left, 32, { lineBreak: false });
  doc.font("Helvetica").fontSize(9).fillColor("#C9D5CE").text("NIRVAN EARTH   ·   VENDOR SETTLEMENT", left, 68, { lineBreak: false });
  doc.fillColor(SAND).font("Helvetica").fontSize(10).text(input.number, left, 36, { width, align: "right", lineBreak: false });
  doc.font("Helvetica").fontSize(9).fillColor("#C9D5CE").text(periodLabel(input.period), left, 54, {
    width,
    align: "right",
    lineBreak: false,
  });

  let y = 136;
  y = factRow(doc, y, left, width, [
    ["Vendor", input.vendorName],
    ["Seller", input.webkulId],
    ["VAT", input.vatRegistered ? "Registered" : "Not registered"],
    ["Rules", input.rulesVersion],
  ]);

  y += 18;
  doc.fillColor(MUTED).font("Helvetica").fontSize(8).text("ORDERS IN THIS PAYMENT", left, y, { lineBreak: false });
  doc.text("AED", left, y, { width, align: "right", lineBreak: false });
  y += 16;
  y = lineTable(doc, y, left, width, input.lines);

  y += 22;
  const figures: Array<[string, string]> = [
    ["Sales base", aed(input.base)],
    ["Discounts already removed from the base", aed(input.discount)],
    [`Commission ${(input.rate * 100).toFixed(0)}%`, aed(input.commission)],
    ["Vendor VAT added back", input.vatRegistered ? aed(input.vat) : "None"],
    ["Adjustments", aed(input.adjustments)],
  ];
  for (const [label, value] of figures) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(10).text(label, left, y, { width: width - 120, lineBreak: false });
    doc.fillColor(INK).font("Helvetica").fontSize(10).text(value, left, y, { width, align: "right", lineBreak: false });
    y += 18;
  }

  y += 8;
  doc.rect(left, y, width, 64).fill(FOREST);
  doc.fillColor(SAND).font("Helvetica").fontSize(9).text("NET PAID", left + 16, y + 14, { lineBreak: false });
  doc.fillColor("#FFFFFF").font("Times-Bold").fontSize(22).text(formatAed(input.net), left + 16, y + 30, { lineBreak: false });
  y += 80;

  doc.rect(left, y, width, 58).lineWidth(1).strokeColor(RULE).stroke();
  doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(connectTransfer ? "STRIPE TRANSFER" : "PAYMENT REFERENCE", left + 14, y + 12, {
    lineBreak: false,
  });
  doc.fillColor(INK).font("Helvetica").fontSize(11).text(input.transferId, left + 14, y + 28, { lineBreak: false });
  doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(paidOn(input.transferredAt), left, y + 28, {
    width: width - 14,
    align: "right",
    lineBreak: false,
  });

  doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(FEE_NOTE, left, y + 74, { width });
  doc.end();
  return done;
}

type Pdf = InstanceType<typeof PDFDocument>;

function factRow(
  doc: Pdf,
  y: number,
  left: number,
  width: number,
  facts: Array<[string, string]>,
): number {
  const col = width / facts.length;
  facts.forEach(([label, value], index) => {
    const x = left + col * index;
    doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(label.toUpperCase(), x, y, { width: col - 12, lineBreak: false });
    doc.fillColor(INK).font("Times-Bold").fontSize(13).text(clip(value, 28), x, y + 13, { width: col - 12, lineBreak: false });
  });
  const lineY = y + 40;
  doc.moveTo(left, lineY).lineTo(left + width, lineY).lineWidth(1).strokeColor(RULE).stroke();
  return lineY;
}

function lineTable(doc: Pdf, y: number, left: number, width: number, lines: AdviceLine[]): number {
  const cols = [
    { label: "Order", w: 72, align: "left" as const },
    { label: "Item", w: 187, align: "left" as const },
    { label: "Base", w: 64, align: "right" as const },
    { label: "Commission", w: 78, align: "right" as const },
    { label: "VAT", w: 50, align: "right" as const },
    { label: "Net", w: width - 451, align: "right" as const },
  ];
  doc.rect(left, y, width, 22).fill(SAND);
  let x = left;
  for (const col of cols) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(col.label.toUpperCase(), x + 6, y + 7, {
      width: col.w - 12,
      align: col.align,
      lineBreak: false,
    });
    x += col.w;
  }
  y += 22;
  const rows = lines.length > 0 ? lines.slice(0, 8) : [];
  if (rows.length === 0) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(10).text("No order lines on this payment.", left + 6, y + 8, { lineBreak: false });
    return y + 28;
  }
  for (const line of rows) {
    const values = [
      clip(line.orderNumber, 14),
      clip(line.title, 32),
      aed(line.base),
      aed(line.commission),
      aed(line.vat),
      aed(line.net),
    ];
    x = left;
    values.forEach((value, index) => {
      const col = cols[index]!;
      doc.fillColor(INK).font("Helvetica").fontSize(9).text(value, x + 6, y + 7, {
        width: col.w - 12,
        align: col.align,
        lineBreak: false,
      });
      x += col.w;
    });
    y += 22;
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.5).strokeColor(RULE).stroke();
  }
  if (lines.length > rows.length) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(`${lines.length - rows.length} more lines are included in the totals.`, left, y + 6, {
      lineBreak: false,
    });
    y += 16;
  }
  return y;
}

function aed(amount: number): string {
  return formatAed(amount).replace("AED ", "");
}

function periodLabel(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  if (!year || !month) return yearMonth;
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

function paidOn(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 3)}...`;
}
