import type { PrismaClient } from "@prisma/client";
import { dubaiYearMonth, isYearMonth } from "@nirvan/rules";
import { HttpError } from "./config.ts";
import { money } from "./money-db.ts";

export async function ownerSalesReport(db: PrismaClient, period: string) {
  if (!isYearMonth(period)) throw new HttpError(400, "period must be YYYY-MM.");
  const lines = await db.orderLine.findMany({
    where: { isPlatformOwn: true },
    include: { order: true },
    orderBy: { paidAt: "desc" },
  });
  const matched = lines.filter((line) => line.paidAt && dubaiYearMonth(line.paidAt) === period);
  const gross = matched.reduce((sum, line) => sum + money(line.gross), 0);
  const discount = matched.reduce((sum, line) => sum + money(line.discount), 0);
  const tax = matched.reduce((sum, line) => sum + money(line.taxAmount), 0);
  return {
    period,
    currency: "AED",
    lineCount: matched.length,
    gross: round2(gross),
    discount: round2(discount),
    tax: round2(tax),
    settledToVendors: false,
    lines: matched.map((line) => ({
      orderNumber: line.order.orderNumber,
      title: line.title,
      gross: money(line.gross),
      discount: money(line.discount),
      tax: money(line.taxAmount),
    })),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function ownerReportCsv(report: Awaited<ReturnType<typeof ownerSalesReport>>): string {
  const header = "order,title,gross,discount,tax";
  const rows = report.lines.map((line) =>
    [line.orderNumber, line.title, line.gross, line.discount, line.tax]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header, ...rows].join("\n");
}
