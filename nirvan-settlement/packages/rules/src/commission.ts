import { roundMoney, sellingAfterDiscount } from "./money.ts";

/** Client lock dated 28 Oct 2026. See docs/CALCULATION_RULES.md. */
export const RULES_VERSION = "2026-10-28";

export const DEFAULT_COMMISSION_RATE = 0.2;

export type ShippingAllocation = "unassigned" | "platform" | "vendor";
export type DeliveryAllocation = ShippingAllocation;

export interface CommissionInput {
  /** Unit price × quantity, before discount. May include VAT and an included delivery allowance. */
  gross: number;
  discount: number;
  /**
   * Vendor VAT on the line. Subtracted from the selling value only when
   * `taxesIncluded` is true (the VAT sits inside the Shopify price).
   * When VAT is added on top, pass `taxesIncluded: false` so it stays
   * visible and out of the commission base.
   * Ignored when `vatRegistered` is false.
   */
  vendorVat?: number;
  /** Default true matches the locked formula: base starts from selling after discount − vendor VAT. */
  taxesIncluded?: boolean;
  /** Non-VAT vendors have no VAT line. Default true so an explicit VAT amount is kept. */
  vatRegistered?: boolean;
  commissionRate?: number;
  /** When false, vendor VAT is shown but not added to vendor net. Default true. */
  includeVendorVatInNet?: boolean;
  /** When false, the included allowance stays inside the commission base. Default true. */
  excludeDeliveryAllowanceFromCommissionBase?: boolean;
  /**
   * Separate Shopify shipping line. Recorded only.
   * Never part of the commission base. Added to vendor entitlement only when allocation is `vendor`.
   */
  shippingAmount?: number;
  shippingAllocation?: ShippingAllocation;
  /**
   * Agreed delivery allowance already included in the discounted product price.
   * Always removed from the commission base. Added to vendor entitlement only when
   * `deliveryAllocation` is `vendor`. Default allocation is `unassigned` (not paid).
   */
  deliveryAllowance?: number;
  deliveryAllocation?: DeliveryAllocation;
  isPlatformOwn?: boolean;
  /** Resolved refunds already allocated to this vendor line. Open items block qualification instead. */
  resolvedAdjustment?: number;
}

export interface CommissionResult {
  rulesVersion: string;
  skipped: boolean;
  gross: number;
  discount: number;
  productSellingAfterDiscount: number;
  productNetExVat: number;
  commissionBase: number;
  commissionAmount: number;
  vendorNet: number;
  vendorVat: number;
  shippingAmount: number;
  /**
   * Separate shipping line. `unassigned` is not added to vendorNet.
   * Only `vendor` is paid to the vendor.
   */
  shippingAllocation: ShippingAllocation;
  deliveryAllowance: number;
  deliveryAllocation: DeliveryAllocation;
}

function allocation(value: ShippingAllocation | undefined): ShippingAllocation {
  if (value === "vendor" || value === "platform" || value === "unassigned") return value;
  return "unassigned";
}

export function calculateCommission(input: CommissionInput): CommissionResult {
  const gross = roundMoney(input.gross);
  const discount = roundMoney(input.discount);
  const productSellingAfterDiscount = sellingAfterDiscount(gross, discount);
  const shippingAmount = roundMoney(input.shippingAmount ?? 0);
  const shippingAllocation = allocation(input.shippingAllocation);
  const deliveryAllowance = roundMoney(input.deliveryAllowance ?? 0);
  const deliveryAllocation = allocation(input.deliveryAllocation);
  const vatRegistered = input.vatRegistered !== false;
  const displayedVat = input.isPlatformOwn || !vatRegistered ? 0 : roundMoney(input.vendorVat ?? 0);
  const taxesIncluded = input.taxesIncluded !== false;
  const vatInsidePrice = taxesIncluded ? displayedVat : 0;

  if (input.isPlatformOwn) {
    return {
      rulesVersion: RULES_VERSION,
      skipped: true,
      gross,
      discount,
      productSellingAfterDiscount,
      productNetExVat: 0,
      commissionBase: 0,
      commissionAmount: 0,
      vendorNet: 0,
      vendorVat: 0,
      shippingAmount,
      shippingAllocation,
      deliveryAllowance,
      deliveryAllocation,
    };
  }

  const productNetExVat = roundMoney(productSellingAfterDiscount - vatInsidePrice);
  const excludeDelivery = input.excludeDeliveryAllowanceFromCommissionBase !== false;
  const includeVat = input.includeVendorVatInNet !== false;
  const allowanceOut = excludeDelivery ? deliveryAllowance : 0;
  const commissionBase = roundMoney(productNetExVat - allowanceOut);
  if (commissionBase < 0) {
    throw new Error("Delivery allowance exceeds the discounted product value excluding VAT.");
  }
  const rate = input.commissionRate ?? DEFAULT_COMMISSION_RATE;
  const commissionAmount = roundMoney(commissionBase * rate);
  const deliveryToVendor = excludeDelivery && deliveryAllocation === "vendor" ? deliveryAllowance : 0;
  const shippingToVendor = shippingAllocation === "vendor" ? shippingAmount : 0;
  const vendorNet = roundMoney(
    commissionBase -
      commissionAmount -
      roundMoney(input.resolvedAdjustment ?? 0) +
      (includeVat ? displayedVat : 0) +
      deliveryToVendor +
      shippingToVendor,
  );

  return {
    rulesVersion: RULES_VERSION,
    skipped: false,
    gross,
    discount,
    productSellingAfterDiscount,
    productNetExVat,
    commissionBase,
    commissionAmount,
    vendorNet,
    vendorVat: displayedVat,
    shippingAmount,
    shippingAllocation,
    deliveryAllowance,
    deliveryAllocation,
  };
}

export interface LineMoneyInput {
  gross: number;
  discount?: number;
  vendorVat?: number;
  vatRegistered?: boolean;
  shippingAmount?: number;
  shippingAllocation?: ShippingAllocation;
  deliveryAllowance?: number;
  deliveryAllocation?: DeliveryAllocation;
  isPlatformOwn?: boolean;
  commissionRate?: number;
  /**
   * True only when vendor VAT is already inside `gross`.
   * Default false: VAT is a separate amount and is not part of the commission base.
   */
  taxesIncluded?: boolean;
}

export interface LineMoney {
  /** Selling value after discount, before commission. */
  productNet: number;
  /** Product net ex-VAT, before the delivery allowance is removed. */
  productNetExVat: number;
  /** Product net with vendor VAT and the included delivery allowance kept out of the 20% base. */
  commissionBase: number;
  commissionAmount: number;
  vendorNet: number;
  vendorVat: number;
  shippingAmount: number;
  deliveryAllowance: number;
  deliveryAllocation: DeliveryAllocation;
  skipVendorSettlement: boolean;
}

/** Spec entry point for line money. Included delivery allowance is removed from the base. */
export function computeLineMoney(input: LineMoneyInput): LineMoney {
  const result = calculateCommission({
    gross: input.gross,
    discount: input.discount ?? 0,
    vendorVat: input.vendorVat,
    vatRegistered: input.vatRegistered,
    taxesIncluded: input.taxesIncluded === true,
    commissionRate: input.commissionRate,
    shippingAmount: input.shippingAmount,
    shippingAllocation: input.shippingAllocation,
    deliveryAllowance: input.deliveryAllowance,
    deliveryAllocation: input.deliveryAllocation,
    isPlatformOwn: input.isPlatformOwn,
  });
  return {
    productNet: result.productSellingAfterDiscount,
    productNetExVat: result.productNetExVat,
    commissionBase: result.commissionBase,
    commissionAmount: result.commissionAmount,
    vendorNet: result.vendorNet,
    vendorVat: result.vendorVat,
    shippingAmount: result.shippingAmount,
    deliveryAllowance: result.deliveryAllowance,
    deliveryAllocation: result.deliveryAllocation,
    skipVendorSettlement: result.skipped,
  };
}

const ALLOWANCE_PROPERTIES = new Set([
  "delivery_allowance",
  "included_delivery",
  "included_delivery_allowance",
  "nirvan_delivery_allowance",
]);

const ALLOCATION_PROPERTIES = new Set([
  "delivery_allocation",
  "delivery_allowance_allocation",
]);

export interface DeliverySignal {
  amount: number;
  allocation: DeliveryAllocation;
  /** `default` means no usable property was present. Test mode then uses 0 / unassigned. */
  source: "property" | "default";
}

/**
 * Reads an included delivery allowance from Shopify line properties.
 * The amount is the line total in AED, not a per-unit figure.
 * Missing or non-numeric values fall back to 0 and `unassigned`.
 */
export function parseDeliveryAllowance(line: {
  properties?: Array<{ name?: string | null; value?: string | number | null }> | null;
}): DeliverySignal {
  const properties = Array.isArray(line.properties) ? line.properties : [];
  let amount: number | null = null;
  let allocation: DeliveryAllocation = "unassigned";
  let sawAllocation = false;

  for (const property of properties) {
    const name = String(property.name ?? "").trim().toLowerCase();
    const raw = property.value == null ? "" : String(property.value).trim().toLowerCase();
    if (ALLOWANCE_PROPERTIES.has(name)) {
      const parsed = Number(String(property.value ?? "").replace(/,/g, ""));
      if (Number.isFinite(parsed) && parsed >= 0) amount = roundMoney(parsed);
    }
    if (ALLOCATION_PROPERTIES.has(name)) {
      sawAllocation = true;
      if (raw === "vendor" || raw === "platform" || raw === "unassigned") allocation = raw;
    }
  }

  if (amount == null) {
    return { amount: 0, allocation: "unassigned", source: "default" };
  }
  return { amount, allocation: sawAllocation ? allocation : "unassigned", source: "property" };
}
