# Worked examples (AED)

Rules version `2026-11-11`. Asserted in `packages/rules/test/rules.test.ts` and, for the mixed cart, in `apps/api/test/matrix.test.ts`.

Separate checkout shipping is not inside any product price, it is not commissioned, and it is not paid to a vendor. Embedded delivery allowance is paid to the vendor and is excluded from the commission base.

## Example 1 — Single VAT vendor (Desert Botanics)

Listed line AED 136.00. Discount AED 10.00. Discounted line AED 126.00.

That discounted line includes vendor VAT AED 6.00 and an included delivery allowance AED 20.00. `taxes_included` is true.

| Step | AED |
|------|-----|
| Discounted product | 126.00 |
| Less vendor VAT | 6.00 |
| Product ex-VAT | 120.00 |
| Less included delivery allowance | 20.00 |
| Commission base | 100.00 |
| Commission 20% | 20.00 |
| Product after commission | 80.00 |
| Vendor VAT line | 6.00 |
| Delivery allowance to vendor | 20.00 |
| Vendor entitlement | 106.00 |

## Example 2 — Non-VAT vendor (Gulf Honey Co)

Listed line AED 160.00. Discount AED 10.00. Discounted line AED 150.00. No vendor VAT line. Shopify may still show a tax of AED 5.00; it is ignored because the vendor is not VAT-registered.

Included delivery allowance AED 30.00, paid to the vendor.

| Step | AED |
|------|-----|
| Discounted product | 150.00 |
| Vendor VAT | 0.00 |
| Less delivery allowance | 30.00 |
| Commission base | 120.00 |
| Commission 20% | 24.00 |
| Delivery allowance to vendor | 30.00 |
| Vendor entitlement | 126.00 |

## Example 3 — Platform gift hamper

Nirvan Earth gift hamper, tag `gift-hamper`, listed AED 180.00. Excluded from third-party settlement. Commission 0. Vendor entitlement 0. Vendor VAT 0.

## Example 4 — Mixed vendor order

One order, three lines, plus checkout shipping AED 15.00. The hamper is the only own-product line, so the own-product subtotal is AED 180.00 and the expected own-product delivery is AED 19.00. The AED 15.00 already on the order is stored as platform shipping. It is not added to either vendor.

| Line | Vendor | Commission | VAT line | Allowance to vendor | Entitlement |
|------|--------|------------|----------|---------------------|-------------|
| Oil, example 1 | Desert Botanics (VAT) | 20.00 | 6.00 | 20.00 | 106.00 |
| Honey, example 2 | Gulf Honey Co (non-VAT) | 24.00 | 0.00 | 30.00 | 126.00 |
| Hamper, example 3 | Nirvan Earth | 0.00 | 0.00 | — | 0.00 |
| Checkout shipping | Platform | 0.00 | — | — | 0.00 |

Customer product total after discounts: 126 + 150 + 180 = **456.00**. Plus the checkout shipping already charged.

Commission retained: **44.00**. Third-party entitlements: 106 + 126 = **232.00**.

## Example 5 — #9004 revised

Listed AED 115.00, taxes included, vendor VAT AED 5.00, embedded allowance AED 10.00.

| Step | AED |
|------|-----|
| Product ex-VAT | 110.00 |
| Commission base | 100.00 |
| Commission 20% | 20.00 |
| VAT added back | 5.00 |
| Allowance to vendor | 10.00 |
| Vendor entitlement | 95.00 |

Formula: (100 − 20) + 5 + 10 = 95. The separate checkout shipping line, if Shopify still has one, stays on the order as platform shipping and is not part of this 95.

## Own-product delivery

| Own-product subtotal | Checkout delivery |
|----------------------|-------------------|
| None (third-party only) | AED 0 |
| Under AED 199 | AED 19, once |
| AED 199 or more | Free |

A third-party line in the same cart does not count toward AED 199 and does not add another delivery charge.
