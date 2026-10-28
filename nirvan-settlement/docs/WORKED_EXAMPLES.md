# Worked examples (AED)

Client copy: `docs/client-report/calculation_examples.md`.

Rules version `2026-10-28`. Asserted in `packages/rules/test/rules.test.ts` and, for the mixed cart, in `apps/api/test/matrix.test.ts`.

Separate checkout shipping is AED 15 on the mixed order. It is not inside any product price, it is not commissioned, and it is not paid to a vendor.

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
| Delivery allocation | unassigned, so 0.00 is paid to the vendor |
| Vendor entitlement | 86.00 |

If the same allowance is allocated to the vendor, entitlement is 80.00 + 6.00 + 20.00 = **106.00**. Commission stays 20.00.

## Example 2 — Non-VAT vendor (Gulf Honey Co)

Listed line AED 160.00. Discount AED 10.00. Discounted line AED 150.00. No vendor VAT line. Shopify may still show a tax of AED 5.00; it is ignored because the vendor is not VAT-registered.

Included delivery allowance AED 30.00, allocation unassigned.

| Step | AED |
|------|-----|
| Discounted product | 150.00 |
| Vendor VAT | 0.00 |
| Less delivery allowance | 30.00 |
| Commission base | 120.00 |
| Commission 20% | 24.00 |
| Vendor entitlement | 96.00 |

## Example 3 — Platform gift hamper

Nirvan Earth gift hamper, tag `gift-hamper`, listed AED 180.00. Excluded from third-party settlement. Commission 0. Vendor entitlement 0. Vendor VAT 0.

## Example 4 — Mixed vendor order

One order, three lines, plus checkout shipping AED 15.00.

| Line | Vendor | Commission | VAT line | Delivery kept off the vendor | Entitlement |
|------|--------|------------|----------|------------------------------|-------------|
| Oil, example 1 | Desert Botanics (VAT) | 20.00 | 6.00 | 20.00 | 86.00 |
| Honey, example 2 | Gulf Honey Co (non-VAT) | 24.00 | 0.00 | 30.00 | 96.00 |
| Hamper, example 3 | Nirvan Earth | 0.00 | 0.00 | — | 0.00 |
| Checkout shipping | Platform, unassigned | 0.00 | — | 15.00 | 0.00 |

Customer product total after discounts: 126 + 150 + 180 = **456.00**. Plus shipping **15.00**.

Commission retained: **44.00**. Third-party entitlements: 86 + 96 = **182.00**. The hamper, both delivery allowances, and the checkout shipping stay out of those transfers while the allowances are unassigned.
