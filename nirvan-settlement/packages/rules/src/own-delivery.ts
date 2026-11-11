import { roundMoney } from "./money.ts";

/** Checkout delivery for Nirvan Earth own products. Third-party lines do not use this fee. */
export const OWN_PRODUCT_DELIVERY_THRESHOLD_AED = 199;
export const OWN_PRODUCT_DELIVERY_FEE_AED = 19;

/**
 * One checkout delivery fee for the own-product subtotal on an order.
 * Under AED 199 the fee is AED 19. At AED 199 or more it is free.
 * A zero subtotal means the cart has no own-product lines, so the fee is zero.
 */
export function expectedOwnProductDeliveryAed(ownProductSubtotal: number): number {
  const subtotal = roundMoney(ownProductSubtotal);
  if (subtotal <= 0) return 0;
  if (subtotal < OWN_PRODUCT_DELIVERY_THRESHOLD_AED) return OWN_PRODUCT_DELIVERY_FEE_AED;
  return 0;
}
