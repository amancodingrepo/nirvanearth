import { roundMoney, sellingAfterDiscount } from "./money.ts";

export const DEFAULT_COMMISSION_RATE = 0.2;

export type ShippingAllocation = "unassigned" | "platform" | "vendor";

export interface CommissionInput {
  /** Unit price × quantity, before discount. */
  gross: number;
  discount: number;
  /**
   * Vendor VAT on the line. Subtracted from the selling value only when
   * `taxesIncluded` is true (the VAT sits inside the Shopify price).
   * When VAT is added on top, pass `taxesIncluded: false` so it stays
   * visible and out of the commission base.
   */
  vendorVat?: number;
  /** Default true matches the locked formula: base = selling after discount − vendor VAT. */
  taxesIncluded?: boolean;
  commissionRate?: number;
  /** Recorded only. Never added to the commission base or vendor net until the client assigns it. */
  shippingAmount?: number;
  isPlatformOwn?: boolean;
  /** Resolved refunds already allocated to this vendor line. Open items block qualification instead. */
  resolvedAdjustment?: number;
}

export interface CommissionResult {
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
   * Client has not signed off who keeps shipping. Leave `unassigned`.
   * Do not add shipping into vendorNet.
   */
  shippingAllocation: ShippingAllocation;
}

export function calculateCommission(input: CommissionInput): CommissionResult {
  const gross = roundMoney(input.gross);
  const discount = roundMoney(input.discount);
  const productSellingAfterDiscount = sellingAfterDiscount(gross, discount);
  const shippingAmount = roundMoney(input.shippingAmount ?? 0);
  const displayedVat = input.isPlatformOwn ? 0 : roundMoney(input.vendorVat ?? 0);
  const taxesIncluded = input.taxesIncluded !== false;
  const vatInsidePrice = taxesIncluded ? displayedVat : 0;

  if (input.isPlatformOwn) {
    return {
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
      shippingAllocation: "unassigned",
    };
  }

  const productNetExVat = roundMoney(productSellingAfterDiscount - vatInsidePrice);
  const rate = input.commissionRate ?? DEFAULT_COMMISSION_RATE;
  const commissionAmount = roundMoney(productNetExVat * rate);
  const vendorNet = roundMoney(
    productNetExVat - commissionAmount - roundMoney(input.resolvedAdjustment ?? 0),
  );

  return {
    skipped: false,
    gross,
    discount,
    productSellingAfterDiscount,
    productNetExVat,
    commissionBase: productNetExVat,
    commissionAmount,
    vendorNet,
    vendorVat: displayedVat,
    shippingAmount,
    shippingAllocation: "unassigned",
  };
}

export interface LineMoneyInput {
  gross: number;
  discount?: number;
  vendorVat?: number;
  shippingAmount?: number;
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
  /** Product net with vendor VAT kept out of the 20% base. */
  commissionBase: number;
  commissionAmount: number;
  vendorNet: number;
  shippingAmount: number;
  skipVendorSettlement: boolean;
}

/** Spec entry point for line money. Shipping is returned and never added to the base. */
export function computeLineMoney(input: LineMoneyInput): LineMoney {
  const result = calculateCommission({
    gross: input.gross,
    discount: input.discount ?? 0,
    vendorVat: input.vendorVat,
    taxesIncluded: input.taxesIncluded === true,
    commissionRate: input.commissionRate,
    shippingAmount: input.shippingAmount,
    isPlatformOwn: input.isPlatformOwn,
  });
  return {
    productNet: result.productSellingAfterDiscount,
    commissionBase: result.commissionBase,
    commissionAmount: result.commissionAmount,
    vendorNet: result.vendorNet,
    shippingAmount: result.shippingAmount,
    skipVendorSettlement: result.skipped,
  };
}
