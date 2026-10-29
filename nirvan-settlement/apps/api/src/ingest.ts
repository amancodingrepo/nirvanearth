import type { Prisma, PrismaClient } from "@prisma/client";
import {
  calculateCommission,
  isPlatformOwn,
  parseDeliveryAllowance,
  qualifyLine,
  resolveSeller,
  returnWindowEndsAt,
  roundMoney,
  type DeliveryAllocation,
} from "@nirvan/rules";
import { recordAudit } from "./audit.ts";
import type { AppConfig } from "./config.ts";
import { dec } from "./money-db.ts";
import { ensureActiveRule, payloadFromConfig, readPayload, type RulePayload } from "./rules-store.ts";
import type { ShopifyLineItem, ShopifyOrder } from "./types.ts";

const PAID_STATUSES = new Set(["paid", "partially_paid", "partially_refunded", "refunded"]);

export async function ingestShopifyOrder(
  db: PrismaClient,
  config: AppConfig,
  order: ShopifyOrder,
  actorEmail = "system",
  now = new Date(),
): Promise<{ shopifyOrderId: string; lineCount: number }> {
  const currency = String(order.currency ?? "").toUpperCase();
  if (currency !== "AED") {
    throw new Error(`Order ${order.id} is ${currency || "missing currency"}. Settlement accepts AED only.`);
  }
  const financialStatus = order.financial_status ?? "";
  if (!PAID_STATUSES.has(financialStatus)) {
    throw new Error(`Order ${order.id} financial_status is ${financialStatus || "missing"}.`);
  }

  const shopifyOrderId = String(order.id);
  const paidAt = new Date(order.processed_at ?? order.created_at ?? now.toISOString());
  const shippingTotal = roundMoney(
    (order.shipping_lines ?? []).reduce((sum, line) => sum + Number(line.price ?? 0), 0),
  );
  const taxesIncluded = Boolean(order.taxes_included);
  const activeRule = await ensureActiveRule(db, config);
  const rules = readPayload(activeRule.payload, payloadFromConfig(config));
  const ruledConfig: AppConfig = {
    ...config,
    commissionRate: rules.commissionRate,
    returnWindowDays: rules.returnWindowDays,
    ownProducts: {
      tags: rules.platformOwnTags,
      vendorNames: rules.platformOwnVendorNames,
      productIds: config.ownProducts.productIds,
    },
  };

  await db.orderSnapshot.upsert({
    where: { shopifyOrderId },
    create: {
      shopifyOrderId,
      orderNumber: String(order.name ?? order.order_number ?? shopifyOrderId),
      currency,
      paidAt,
      financialStatus,
      fulfillmentStatus: order.fulfillment_status ?? null,
      gateway: order.gateway ?? null,
      taxesIncluded,
      shippingTotal: dec(shippingTotal),
      shippingAllocation: "unassigned",
      rawJson: order as unknown as Prisma.InputJsonValue,
    },
    update: {
      orderNumber: String(order.name ?? order.order_number ?? shopifyOrderId),
      paidAt,
      financialStatus,
      fulfillmentStatus: order.fulfillment_status ?? null,
      gateway: order.gateway ?? null,
      taxesIncluded,
      shippingTotal: dec(shippingTotal),
      rawJson: order as unknown as Prisma.InputJsonValue,
    },
  });

  const seenLineIds: string[] = [];
  for (const line of order.line_items ?? []) {
    const shopifyLineId = String(line.id);
    seenLineIds.push(shopifyLineId);
    await upsertLine(db, ruledConfig, order, line, shopifyOrderId, paidAt, taxesIncluded, rules);
  }

  await syncRefunds(db, order, shopifyOrderId);
  await syncSyntheticAdjustments(db, order, shopifyOrderId);
  await refreshLineQualification(db, ruledConfig, shopifyOrderId, now, rules);

  await recordAudit(db, "order.ingested", actorEmail, {
    shopifyOrderId,
    lines: seenLineIds.length,
    shippingTotal,
  });

  return { shopifyOrderId, lineCount: seenLineIds.length };
}

async function upsertLine(
  db: PrismaClient,
  config: AppConfig,
  order: ShopifyOrder,
  line: ShopifyLineItem,
  shopifyOrderId: string,
  paidAt: Date,
  taxesIncluded: boolean,
  rules: RulePayload,
): Promise<void> {
  const own = isPlatformOwn(
    { tags: line.product_tags, id: line.product_id },
    { vendor: line.vendor },
    config.ownProducts,
  );

  const vendorId = own ? null : await resolveVendorId(db, line);
  const quantity = Number(line.quantity ?? 1);
  const gross = roundMoney(Number(line.price ?? 0) * quantity);
  const discount = lineDiscount(line);
  const taxAmount = roundMoney(
    (line.tax_lines ?? []).reduce((sum, tax) => sum + Number(tax.price ?? 0), 0),
  );

  const vendor = vendorId ? await db.vendor.findUnique({ where: { id: vendorId } }) : null;
  const vatRegistered = Boolean(vendor?.vatRegistered);
  const vendorVat = vatRegistered ? taxAmount : 0;
  const delivery = parseDeliveryAllowance(line);
  const fulfilledAt = fulfillmentTime(order, line.id);
  const money = calculateCommission({
    gross,
    discount,
    vendorVat,
    vatRegistered,
    taxesIncluded,
    commissionRate: rules.commissionRate,
    includeVendorVatInNet: rules.includeVendorVatInNet,
    excludeDeliveryAllowanceFromCommissionBase: rules.excludeDeliveryAllowanceFromCommissionBase,
    shippingAmount: 0,
    deliveryAllowance: delivery.amount,
    deliveryAllocation: delivery.allocation,
    isPlatformOwn: own,
  });

  const data = {
    vendorId,
    isPlatformOwn: own,
    title: line.title ?? "Item",
    quantity,
    gross: dec(money.gross),
    discount: dec(money.discount),
    productNet: dec(money.productNetExVat),
    vendorVat: dec(money.vendorVat),
    taxAmount: dec(taxAmount),
    taxesIncluded,
    shippingAmount: dec(0),
    shippingAllocation: "unassigned",
    deliveryAllowance: dec(money.deliveryAllowance),
    deliveryAllocation: money.deliveryAllocation,
    commissionBase: dec(money.commissionBase),
    commissionAmount: dec(money.commissionAmount),
    vendorNet: dec(money.vendorNet),
    paidAt,
    fulfilledAt,
    returnWindowEndsAt: fulfilledAt ? returnWindowEndsAt(fulfilledAt, config.returnWindowDays) : null,
  };

  const existing = await db.orderLine.findUnique({
    where: { shopifyOrderId_shopifyLineId: { shopifyOrderId, shopifyLineId: String(line.id) } },
  });

  if (existing?.status === "packed") {
    await db.orderLine.update({
      where: { id: existing.id },
      data: {
        title: data.title,
        fulfilledAt: data.fulfilledAt,
        returnWindowEndsAt: data.returnWindowEndsAt,
      },
    });
    return;
  }

  if (existing) {
    await db.orderLine.update({ where: { id: existing.id }, data });
  } else {
    await db.orderLine.create({
      data: {
        ...data,
        shopifyOrderId,
        shopifyLineId: String(line.id),
        status: "open",
      },
    });
  }

}

function lineDiscount(line: ShopifyLineItem): number {
  if (line.discount_allocations && line.discount_allocations.length > 0) {
    return roundMoney(line.discount_allocations.reduce((sum, item) => sum + Number(item.amount ?? 0), 0));
  }
  return roundMoney(Number(line.total_discount ?? 0));
}

function fulfillmentTime(order: ShopifyOrder, lineId: number | string): Date | null {
  for (const fulfillment of order.fulfillments ?? []) {
    const ids = (fulfillment.line_items ?? []).map((item) => String(item.id));
    const matchesLine = ids.length === 0 || ids.includes(String(lineId));
    if (matchesLine && fulfillment.created_at) return new Date(fulfillment.created_at);
  }
  if (order.fulfillment_status === "fulfilled" && (order.updated_at || order.processed_at)) {
    return new Date(order.updated_at ?? order.processed_at ?? Date.now());
  }
  return null;
}

async function resolveVendorId(db: PrismaClient, line: ShopifyLineItem): Promise<string | null> {
  const seller = resolveSeller(line);
  if (!seller) return null;
  const key = seller.webkulSellerId;

  if (key) {
    const byKey = await db.vendor.findFirst({
      where: { OR: [{ webkulSellerId: key }, { externalKey: key }] },
    });
    if (byKey) {
      if (!byKey.webkulSellerId || !byKey.externalKey) {
        await db.vendor.update({
          where: { id: byKey.id },
          data: {
            webkulSellerId: byKey.webkulSellerId ?? key,
            externalKey: byKey.externalKey ?? key,
          },
        });
      }
      return byKey.id;
    }
  }
  if (seller.sellerName) {
    const byName = await db.vendor.findFirst({
      where: { name: { equals: seller.sellerName, mode: "insensitive" } },
    });
    if (byName) {
      if (key && (!byName.webkulSellerId || !byName.externalKey)) {
        await db.vendor.update({
          where: { id: byName.id },
          data: {
            webkulSellerId: byName.webkulSellerId ?? key,
            externalKey: byName.externalKey ?? key,
          },
        });
      }
      return byName.id;
    }
  }

  const created = await db.vendor.create({
    data: {
      name: seller.sellerName ?? key ?? "Vendor",
      webkulSellerId: key,
      externalKey: key,
      vatRegistered: false,
      active: true,
    },
  });
  return created.id;
}

/** Re-read stored Shopify snapshots and refill vendor, commission, and qualification. */
export async function enrichLines(
  db: PrismaClient,
  config: AppConfig,
  actorEmail = "enrich",
  now = new Date(),
): Promise<{ orders: number; lines: number }> {
  const snapshots = await db.orderSnapshot.findMany();
  let orders = 0;
  let lines = 0;
  for (const snapshot of snapshots) {
    const order = snapshot.rawJson as unknown as ShopifyOrder;
    if (!order || order.id == null) continue;
    const result = await ingestShopifyOrder(db, config, order, actorEmail, now);
    orders += 1;
    lines += result.lineCount;
  }
  return { orders, lines };
}

async function syncRefunds(db: PrismaClient, order: ShopifyOrder, shopifyOrderId: string): Promise<void> {
  for (const refund of order.refunds ?? []) {
    for (const item of refund.refund_line_items ?? []) {
      const externalId = `shopify:refund:${refund.id}:${item.line_item_id}`;
      const line = await db.orderLine.findUnique({
        where: {
          shopifyOrderId_shopifyLineId: {
            shopifyOrderId,
            shopifyLineId: String(item.line_item_id),
          },
        },
      });
      await db.adjustment.upsert({
        where: { externalId },
        create: {
          externalId,
          shopifyOrderId,
          orderLineId: line?.id,
          type: "refund",
          amount: dec(roundMoney(Number(item.subtotal ?? 0))),
          status: "open",
          source: "shopify",
        },
        update: {
          orderLineId: line?.id,
          amount: dec(roundMoney(Number(item.subtotal ?? 0))),
          status: "open",
          resolvedAt: null,
        },
      });
    }
  }
}

async function syncSyntheticAdjustments(
  db: PrismaClient,
  order: ShopifyOrder,
  shopifyOrderId: string,
): Promise<void> {
  for (const adjustment of order.nirvan_adjustments ?? []) {
    const externalId = adjustment.external_id ?? `synthetic:${shopifyOrderId}:${adjustment.line_item_id}:${adjustment.type}`;
    const line = adjustment.line_item_id
      ? await db.orderLine.findUnique({
          where: {
            shopifyOrderId_shopifyLineId: {
              shopifyOrderId,
              shopifyLineId: String(adjustment.line_item_id),
            },
          },
        })
      : null;
    const status = adjustment.status === "resolved" ? "resolved" : "open";
    await db.adjustment.upsert({
      where: { externalId },
      create: {
        externalId,
        shopifyOrderId,
        orderLineId: line?.id,
        type: adjustment.type ?? "other",
        amount: dec(roundMoney(Number(adjustment.amount ?? 0))),
        status,
        source: "manual",
        resolvedAt: status === "resolved" ? new Date() : null,
      },
      update: {
        orderLineId: line?.id,
        type: adjustment.type ?? "other",
        amount: dec(roundMoney(Number(adjustment.amount ?? 0))),
        status,
      },
    });
  }
}

export async function refreshLineQualification(
  db: PrismaClient,
  config: AppConfig,
  shopifyOrderId: string | null,
  now: Date,
  rules?: RulePayload,
): Promise<void> {
  const payload = rules ?? readPayload((await ensureActiveRule(db, config)).payload, payloadFromConfig(config));
  const lines = await db.orderLine.findMany({
    where: shopifyOrderId ? { shopifyOrderId } : undefined,
    include: { adjustments: true, vendor: true, order: true },
  });

  for (const line of lines) {
    if (line.status === "packed") continue;
    const resolved = roundMoney(
      line.adjustments
        .filter((item) => item.status === "resolved" && item.orderLineId === line.id)
        .reduce((sum, item) => sum + Number(item.amount), 0),
    );
    const raw = line.order.rawJson as unknown as ShopifyOrder;
    const rawLine = (raw.line_items ?? []).find((item) => String(item.id) === line.shopifyLineId);
    const delivery = rawLine ? parseDeliveryAllowance(rawLine) : {
      amount: Number(line.deliveryAllowance),
      allocation: line.deliveryAllocation as DeliveryAllocation,
      source: "default" as const,
    };
    const vatRegistered = Boolean(line.vendor?.vatRegistered);
    const vendorVat = vatRegistered ? Number(line.taxAmount) : 0;
    const money = calculateCommission({
      gross: Number(line.gross),
      discount: Number(line.discount),
      vendorVat,
      vatRegistered,
      taxesIncluded: line.taxesIncluded,
      commissionRate: payload.commissionRate,
      includeVendorVatInNet: payload.includeVendorVatInNet,
      excludeDeliveryAllowanceFromCommissionBase: payload.excludeDeliveryAllowanceFromCommissionBase,
      isPlatformOwn: line.isPlatformOwn,
      resolvedAdjustment: resolved,
      deliveryAllowance: delivery.amount,
      deliveryAllocation: delivery.allocation,
    });
    const financialStatus = raw.financial_status ?? line.order.financialStatus;
    const qualification = qualifyLine({
      isPlatformOwn: line.isPlatformOwn,
      vendorId: line.vendorId,
      fulfilledAt: line.fulfilledAt,
      returnWindowEndsAt: line.fulfilledAt
        ? returnWindowEndsAt(line.fulfilledAt, payload.returnWindowDays)
        : line.returnWindowEndsAt,
      hasOpenAdjustment: line.adjustments.some((item) => item.status === "open"),
      now,
      cancelled: Boolean(raw.cancelled_at) || financialStatus === "voided",
      financialStatus,
    });
    await db.orderLine.update({
      where: { id: line.id },
      data: {
        productNet: dec(money.productNetExVat),
        vendorVat: dec(money.vendorVat),
        commissionBase: dec(money.commissionBase),
        commissionAmount: dec(money.commissionAmount),
        vendorNet: dec(money.vendorNet),
        deliveryAllowance: dec(money.deliveryAllowance),
        deliveryAllocation: money.deliveryAllocation,
        returnWindowEndsAt: line.fulfilledAt
          ? returnWindowEndsAt(line.fulfilledAt, payload.returnWindowDays)
          : line.returnWindowEndsAt,
        status: qualification.status,
        blockReason: qualification.qualified ? null : qualification.reason,
      },
    });
  }
}

export async function qualifyAll(db: PrismaClient, config: AppConfig, now = new Date()): Promise<number> {
  await refreshLineQualification(db, config, null, now);
  return db.orderLine.count({ where: { status: "qualified" } });
}
