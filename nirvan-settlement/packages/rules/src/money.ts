/**
 * AED major units in memory. Stripe receives fils (× 100).
 * Rounding is half-up to 2 decimal places (Math.round on fils).
 */

export function roundMoney(amount: number): number {
  if (!Number.isFinite(amount)) {
    throw new Error("amount is not a finite number");
  }
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function toFils(major: number): number {
  return Math.round(roundMoney(major) * 100);
}

export function formatAed(amount: number): string {
  return `AED ${roundMoney(amount).toFixed(2)}`;
}

export function sellingAfterDiscount(gross: number, discount: number): number {
  return roundMoney(gross - discount);
}
