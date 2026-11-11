# Locked calculation rules

Agreement NE-SA-2026-09-V3, updated by the client lock dated **11 Nov 2026**.
Rules version: `2026-11-11`, implemented in `packages/rules`.

Vendor VAT stays out of the commission base and is added back into `vendorNet` for a VAT-registered vendor. An included delivery allowance is removed from the commission base and is paid to the vendor. A positive allowance is vendor entitlement even when an older line property still says `unassigned` or `platform`.

| Rule | Definition |
|------|------------|
| Commission | 20% of the discounted product selling value, excluding vendor VAT and excluding the embedded delivery allowance |
| VAT, registered vendor | Shown as its own line. If Shopify `taxes_included` is true, VAT is subtracted before the 20%. If VAT is added on top, it is shown and not subtracted again. It is then added to vendor entitlement. |
| VAT, non-registered | No vendor VAT line. A Shopify tax amount on the line is ignored for commission and for vendor net. |
| Included delivery allowance | Subtracted from the commission base. Line properties `delivery_allowance` (AED line total) and `delivery_allocation`. A positive amount is stored as allocation `vendor` and added to vendor net. Amount 0 stays `unassigned` and adds nothing. |
| Separate checkout shipping | Shopify `shipping_lines` total. Stored on the order as platform shipping. Not commissioned. Not added to vendor net. |
| Own-product checkout delivery | Own-product subtotal under AED 199: one AED 19 charge for that checkout. Own-product subtotal of AED 199 or more: free. Third-party lines do not count toward the threshold and do not add a checkout delivery charge. The ledger stores `own_product_subtotal` and `expected_own_delivery`. A mismatch with `shipping_lines` is an `order.shipping.review` audit. It does not change vendor net. |
| Own products / gift hampers | No vendor, no commission, no settlement line. Tags `nirvan-own` and `gift-hamper`, vendor name Nirvan Earth, and `PLATFORM_OWN_*`. |
| Checkout gateway fees | Borne by Nirvan Earth inside the marketplace commission. Not deducted from vendor net. |
| Connect transfer fees and bank payout fees | Borne by Nirvan Earth. Recorded separately for reconciliation. Not deducted from vendor settlements. |
| Qualification | Paid (`paid`, `partially_paid`, `partially_refunded`), not cancelled or voided, not fully `refunded`, fulfilled, return window ended (`now` strictly after `return_window_ends_at`), vendor set, no open refund / chargeback / dispute |
| Return window | `RETURN_WINDOW_DAYS` (default 14) after fulfilment |
| Timing | Qualified lines are payable on the 10th of the following month after approval, when the platform AED balance covers a Connect transfer. Otherwise they roll. |
| Currency | AED in the database (decimal). Stripe receives fils. |
| Rounding | Half-up to 2 decimal places. |
| Approver | `APPROVER_EMAILS`, default `admin@nirvanearth.com` |
| Closed packs | A transferred or manually paid settlement line keeps the amount already paid. Requalify may update the order-line rule net and writes `line.requalify.transferred_unchanged` when that rule net differs. It does not start a second payment. |

```text
discounted          = gross - discount
product_ex_vat      = discounted - vendor_vat_inside_price
commission_base     = product_ex_vat - included_delivery_allowance
commission          = round(commission_base * 0.20)
vendor_entitlement  = commission_base - commission - resolved_adjustments
                      + vendor_vat
                      + included_delivery_allowance
```

Checkout shipping is not in that formula.

#9004, revised: listed AED 115 including VAT AED 5 and allowance AED 10. Base 100. Commission 20. Vendor net (100 − 20) + 5 + 10 = **95**. The November 2026 test transfer that already paid this line at 85 is not increased. The gap is audited.

Worked numbers are in `docs/WORKED_EXAMPLES.md`.

Month boundaries use Asia/Dubai.

## NE1001

Order NE1001 (Anik Bilala, AED 169, paid and fulfilled in Shopify on 2 Aug 2026) is a historical order from before this settlement integration. It is not imported retrospectively. Orders paid after the webhook and sync were connected continue to ingest. NE1002 and NE1003 are already in the ledger as own sales.
