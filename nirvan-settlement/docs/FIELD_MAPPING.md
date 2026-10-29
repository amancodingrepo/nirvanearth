# Field mapping (test mode)

Rules version `2026-10-28`. Shopify Admin order payload and Webkul values written onto the line. There is no separate Webkul API client in this app.

| Shopify / Webkul field | Settlement meaning | Rule use |
|------------------------|--------------------|----------|
| `line_items.price` × `line_items.quantity` | Listed product value before discount (AED) | `gross`. May include VAT and an included delivery allowance. |
| `line_items.discount_allocations[].amount`, else `line_items.total_discount` | Discount on that line | Subtracted first. Commission uses the discounted value. |
| `line_items.quantity` | Units sold | Multiplies `price` into `gross`. The delivery allowance property is a line total, not a per-unit amount. |
| Line property `webkul_seller_id` (also `seller_id`, `vendor_id`, `_seller`, and the other names in `parseSellerSignal`) | Webkul seller id | Matches `vendors.webkul_seller_id` or `external_key`. |
| SKU prefix `sellerKey::sku` | Fallback seller id | Used when no seller property is present. |
| `line_items.vendor` | Seller display name | Fallback match on `vendors.name`. Also an own-product signal when the name is `Nirvan Earth` (`PLATFORM_OWN_VENDOR_NAMES`). |
| `line_items.tax_lines[].price` and `title` | Tax charged on the line | Summed into `tax_amount`. Treated as vendor VAT only when the matched vendor has `vat_registered = true` and the title is stored as returned by Shopify. |
| `order.taxes_included` | Whether VAT sits inside `price` | `true`: subtract vendor VAT before the 20%. `false`: show VAT and do not subtract it again. Then add vendor VAT onto vendor entitlement. |
| `vendors.vat_registered` | VAT-registered supplier | `false`: no vendor VAT line, even if Shopify sent a tax amount. New unknown sellers are created as non-VAT. |
| Line property `delivery_allowance` (also `included_delivery`, `included_delivery_allowance`, `nirvan_delivery_allowance`) | Agreed delivery allowance included in the listed price | Subtracted from the commission base. Missing or non-numeric: **0** in test mode. |
| Line property `delivery_allocation` (`vendor`, `platform`, `unassigned`) | Who keeps that allowance | Only `vendor` is added to vendor entitlement. Missing or unknown: **`unassigned`**. |
| `order.shipping_lines[].price` | Separate checkout shipping | Stored on the order as `shipping_total`. Not commissioned. Allocation stays `unassigned` and is not added to vendor net. |
| `line_items.product_tags`, product id, vendor name | Own catalogue / gift hamper | Tags `nirvan-own`, `gift-hamper`, vendor `Nirvan Earth`, `PLATFORM_OWN_PRODUCT_IDS`. Excluded from third-party settlement. |
| `order.financial_status` | Paid, partial, refunded, voided | Qualifies only for `paid`, `partially_paid`, `partially_refunded`. `refunded` blocks as `refunded`. `pending` and other unpaid statuses block as `unpaid`. `voided` blocks as `cancelled`. Ingest still accepts `refunded` so the line can be stored and blocked. |
| `order.cancelled_at` | Order cancelled | Blocks the line as `cancelled`. |
| `order.fulfillment_status`, `fulfillments[].created_at`, `fulfillments[].line_items[].id` | Fulfilled at | Required before the return window starts. Unfulfilled stays `open` / `not_fulfilled`. |
| `order.refunds[].refund_line_items` | Refund against a line | Open adjustment. Blocks qualification until resolved. |
| `nirvan_adjustments` | Chargeback, dispute, or other hold | Same open-adjustment gate. Not a Shopify field. Test and manual use. |
| `order.currency` | Settlement currency | AED only. Other currencies are rejected at ingest. |

## Gaps and test-mode defaults

| Gap | What the API does not give | Test-mode default |
|-----|----------------------------|-------------------|
| Included delivery allowance | Shopify has no standard field for a delivery amount baked into the product price. | 0 and `unassigned` until a line property is set. Separate `shipping_lines` are not treated as this allowance. Test order #9004 sets `included_delivery_allowance` = 10 and `delivery_allocation` = `unassigned` on a VAT line priced at 115. Commission base is 100. The allowance is not added to vendor net. |
| Who keeps the allowance | No commercial flag in Shopify or Webkul. | `unassigned`. The amount is not commissioned and is not paid to the vendor. |
| Webkul seller API | This app does not call Webkul. Seller id is whatever Webkul writes onto the Shopify line. | Match property, then `sellerKey::sku`, then vendor name. |
| VAT registration | Shopify tax lines do not say the vendor is VAT-registered. | `vendors.vat_registered`. Unknown new vendors are non-VAT, so their tax is not a vendor VAT line. |
| Per-unit allowance | A property named like a unit rate would be wrong. | The property is the line total in AED. |
