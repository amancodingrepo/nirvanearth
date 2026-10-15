# Locked calculation rules

Agreement NE-SA-2026-09-V3. Implemented in `packages/rules`.

| Rule | Definition |
|------|------------|
| Commission | 20% of product selling value after discounts, excluding vendor VAT |
| VAT, registered vendor | Shown separately. If Shopify `taxes_included` is true, VAT is subtracted before the 20%. If VAT is added on top, it is shown and not subtracted again. |
| VAT, non-registered | No vendor VAT |
| Own products / gift hampers | No vendor, no commission, no settlement line |
| Shipping | Separate field. Allocation stays `unassigned` until the client signs off platform vs vendor. Not added to vendor net. |
| Stripe / Connect fees | Borne by Nirvan Earth. Noted on the statement. Not deducted from vendor net. |
| Qualification | Fulfilled, return window ended (`now` strictly after `return_window_ends_at`), vendor set, no open refund / chargeback / dispute |
| Return window | `RETURN_WINDOW_DAYS` (default 14) after fulfilment |
| Timing | Qualified lines are payable on the 10th of the following month after approval, when the platform AED balance covers the transfer. Otherwise they roll. |
| Currency | AED in the database (decimal). Stripe receives fils. |
| Rounding | Half-up to 2 decimal places. The same rounding is used in tests and in `Math.round(vendorNet * 100)` fils. |
| Approver | `APPROVER_EMAILS`, default `admin@nirvanearth.com` |

```text
product_net_ex_vat = selling_after_discount - vendor_vat_inside_price
commission         = round(product_net_ex_vat * 0.20)
vendor_net         = product_net_ex_vat - commission - resolved_adjustments
```

Month boundaries use Asia/Dubai.
