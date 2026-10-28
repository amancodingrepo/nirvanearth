# Locked calculation rules

Agreement NE-SA-2026-09-V3, updated by the client lock dated **28 Oct 2026**.
Rules version: `2026-10-28`, implemented in `packages/rules`.

This version changes vendor entitlement. Vendor VAT is still excluded from the commission base, and it is now added back into `vendorNet`. An included delivery allowance is removed from the commission base. It is paid to the vendor only when its allocation is `vendor`. The default allocation is `unassigned`.

| Rule | Definition |
|------|------------|
| Commission | 20% of the discounted product value, excluding vendor VAT and excluding any delivery allowance included in that price |
| VAT, registered vendor | Shown as its own line. If Shopify `taxes_included` is true, VAT is subtracted before the 20%. If VAT is added on top, it is shown and not subtracted again. It is then added to vendor entitlement. |
| VAT, non-registered | No vendor VAT line. A Shopify tax amount on the line is ignored for commission and for vendor net. |
| Included delivery allowance | Subtracted from the commission base. Line properties `delivery_allowance` (AED line total) and `delivery_allocation` (`vendor`, `platform`, `unassigned`). Missing property: amount 0, allocation `unassigned`. |
| Delivery payee | Added to vendor entitlement only when allocation is `vendor`. `platform` and `unassigned` stay with the platform until a commercial assignment. |
| Separate shipping | Shopify `shipping_lines` total. Not inside the product price, not commissioned, allocation `unassigned`, not added to vendor net. |
| Own products / gift hampers | No vendor, no commission, no settlement line. Tags `nirvan-own` and `gift-hamper`, vendor name Nirvan Earth, and `PLATFORM_OWN_*`. |
| Stripe / Connect fees | Borne by Nirvan Earth. Noted on the statement. Not deducted from vendor net. |
| Qualification | Paid (`paid`, `partially_paid`, `partially_refunded`), not cancelled or voided, not fully `refunded`, fulfilled, return window ended (`now` strictly after `return_window_ends_at`), vendor set, no open refund / chargeback / dispute |
| Return window | `RETURN_WINDOW_DAYS` (default 14) after fulfilment |
| Timing | Qualified lines are payable on the 10th of the following month after approval, when the platform AED balance covers the transfer. Otherwise they roll. |
| Currency | AED in the database (decimal). Stripe receives fils. |
| Rounding | Half-up to 2 decimal places. The same rounding is used in tests and in `Math.round(vendorNet * 100)` fils. |
| Approver | `APPROVER_EMAILS`, default `admin@nirvanearth.com` |

```text
discounted          = gross - discount
product_ex_vat      = discounted - vendor_vat_inside_price
commission_base     = product_ex_vat - included_delivery_allowance
commission          = round(commission_base * 0.20)
vendor_entitlement  = commission_base - commission - resolved_adjustments
                      + vendor_vat
                      + delivery_allowance_if_allocation_is_vendor
                      + separate_shipping_if_allocation_is_vendor
```

Worked numbers are in `docs/WORKED_EXAMPLES.md` and `packages/rules/src/examples.ts`.

Month boundaries use Asia/Dubai.
