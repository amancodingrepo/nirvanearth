import { calculateCommission, type CommissionInput, type CommissionResult } from "./commission.ts";

/**
 * Worked AED examples for rules version 2026-10-28.
 * Delivery allowance is inside the listed product price.
 * A separate Shopify shipping line is not inside that price.
 * Default delivery allocation is unassigned, so the allowance is not paid to the vendor.
 */

export interface WorkedLine {
  label: string;
  vendor: string;
  input: CommissionInput;
  result: CommissionResult;
}

function line(label: string, vendor: string, input: CommissionInput): WorkedLine {
  return { label, vendor, input, result: calculateCommission(input) };
}

/** Listed 136 incl. VAT 6 and delivery 20. Discount 10. Discounted line = 126. */
export const exampleVatVendor = line("VAT vendor, delivery unassigned", "Desert Botanics", {
  gross: 136,
  discount: 10,
  vendorVat: 6,
  taxesIncluded: true,
  vatRegistered: true,
  deliveryAllowance: 20,
  deliveryAllocation: "unassigned",
});

export const exampleVatVendorDeliveryPaid = line("VAT vendor, delivery belongs to vendor", "Desert Botanics", {
  ...exampleVatVendor.input,
  deliveryAllocation: "vendor",
});

/** Discounted 150 with no vendor VAT. Included delivery 30. */
export const exampleNonVatVendor = line("Non-VAT vendor", "Gulf Honey Co", {
  gross: 160,
  discount: 10,
  vendorVat: 5,
  taxesIncluded: false,
  vatRegistered: false,
  deliveryAllowance: 30,
  deliveryAllocation: "unassigned",
});

export const exampleGiftHamper = line("Platform gift hamper", "Nirvan Earth", {
  gross: 180,
  discount: 0,
  vendorVat: 9,
  taxesIncluded: true,
  vatRegistered: true,
  deliveryAllowance: 0,
  isPlatformOwn: true,
});

/** Separate checkout shipping. Not inside any product price and not commissioned. */
export const MIXED_ORDER_SHIPPING = 15;

export function mixedVendorOrder(): {
  lines: WorkedLine[];
  separateShipping: number;
  commissionTotal: number;
  vendorEntitlementTotal: number;
  customerProductTotal: number;
} {
  const lines = [exampleVatVendor, exampleNonVatVendor, exampleGiftHamper];
  const commissionTotal = roundSum(lines.map((item) => item.result.commissionAmount));
  const vendorEntitlementTotal = roundSum(lines.map((item) => item.result.vendorNet));
  const customerProductTotal = roundSum(
    lines.map((item) => item.result.productSellingAfterDiscount),
  );
  return {
    lines,
    separateShipping: MIXED_ORDER_SHIPPING,
    commissionTotal,
    vendorEntitlementTotal,
    customerProductTotal,
  };
}

function roundSum(values: number[]): number {
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100;
}
