import { money } from "./money-db.ts";

type Decimalish = { toString(): string } | number | null;

export function presentLine(line: {
  id: string;
  shopifyOrderId: string;
  shopifyLineId: string;
  vendorId: string | null;
  isPlatformOwn: boolean;
  title: string;
  quantity: number;
  gross: Decimalish;
  discount: Decimalish;
  productNet: Decimalish;
  vendorVat: Decimalish;
  shippingAmount: Decimalish;
  shippingAllocation: string;
  deliveryAllowance?: Decimalish;
  deliveryAllocation?: string;
  commissionBase: Decimalish;
  commissionAmount: Decimalish;
  vendorNet: Decimalish;
  paidAt: Date | null;
  fulfilledAt: Date | null;
  returnWindowEndsAt: Date | null;
  status: string;
  blockReason: string | null;
  vendor?: { id: string; name: string; vatRegistered: boolean; stripeAccountId: string | null } | null;
  order?: { orderNumber: string; shippingTotal: Decimalish; shippingAllocation: string; gateway: string | null };
}) {
  return {
    id: line.id,
    shopifyOrderId: line.shopifyOrderId,
    shopifyLineId: line.shopifyLineId,
    orderNumber: line.order?.orderNumber ?? null,
    vendorId: line.vendorId,
    vendorName: line.vendor?.name ?? null,
    vatRegistered: line.vendor?.vatRegistered ?? false,
    isPlatformOwn: line.isPlatformOwn,
    title: line.title,
    quantity: line.quantity,
    gross: money(line.gross),
    discount: money(line.discount),
    productNet: money(line.productNet),
    vendorVat: money(line.vendorVat),
    shippingAmount: money(line.shippingAmount),
    deliveryAllowance: money(line.deliveryAllowance ?? 0),
    deliveryAllocation: line.deliveryAllocation ?? "unassigned",
    orderShippingTotal: line.order ? money(line.order.shippingTotal) : 0,
    shippingAllocation: line.order?.shippingAllocation ?? line.shippingAllocation,
    commissionBase: money(line.commissionBase),
    commissionAmount: money(line.commissionAmount),
    vendorNet: money(line.vendorNet),
    paidAt: line.paidAt,
    fulfilledAt: line.fulfilledAt,
    returnWindowEndsAt: line.returnWindowEndsAt,
    status: line.status,
    blockReason: line.blockReason,
    gateway: line.order?.gateway ?? null,
  };
}

export function presentPack(pack: {
  id: string;
  yearMonth: string;
  status: string;
  createdAt: Date;
  lines: Array<{
    id: string;
    vendorId: string;
    kind: string;
    commissionBaseSum: Decimalish;
    commissionSum: Decimalish;
    vendorNetSum: Decimalish;
    shippingSum: Decimalish;
    orderLineCount: number;
    feeNotes: string | null;
    status: string;
    stripeTransferId: string | null;
    vendor: { name: string; email: string | null; vatRegistered: boolean; stripeAccountId: string | null };
  }>;
}) {
  const payable = pack.lines.filter((line) => line.kind === "payable");
  const held = pack.lines.filter((line) => line.kind === "held");
  return {
    id: pack.id,
    yearMonth: pack.yearMonth,
    status: pack.status,
    createdAt: pack.createdAt,
    payableTotal: payable.reduce((sum, line) => sum + money(line.vendorNetSum), 0),
    commissionTotal: payable.reduce((sum, line) => sum + money(line.commissionSum), 0),
    heldTotal: held.reduce((sum, line) => sum + money(line.vendorNetSum), 0),
    lines: pack.lines.map((line) => ({
      id: line.id,
      vendorId: line.vendorId,
      vendorName: line.vendor.name,
      vendorEmail: line.vendor.email,
      vatRegistered: line.vendor.vatRegistered,
      stripeAccountId: line.vendor.stripeAccountId,
      kind: line.kind,
      commissionBaseSum: money(line.commissionBaseSum),
      commissionSum: money(line.commissionSum),
      vendorNetSum: money(line.vendorNetSum),
      shippingSum: money(line.shippingSum),
      orderLineCount: line.orderLineCount,
      feeNotes: line.feeNotes,
      status: line.status,
      stripeTransferId: line.stripeTransferId,
    })),
  };
}
