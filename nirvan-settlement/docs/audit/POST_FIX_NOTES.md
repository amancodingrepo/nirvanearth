# Post-fix notes — 30 October 2026

Test mode only. Live transfers stay blocked unless `ALLOW_LIVE` or `ALLOW_LIVE_TRANSFERS` is set. This change does not touch the Shopify payment gateway or the Stripe payout schedule.

## What changed

- Paid Shopify orders can enter the ledger from `orders/paid`, `orders/updated`, and `refunds/create` at `POST /api/shopify/webhooks`. The body is checked with `SHOPIFY_API_SECRET`. A bad signature is rejected.
- On https hosts, startup registers those three topics. A 20-minute sync is the backup. Sync now still works and now follows Shopify's next-page cursor instead of stopping at 50 orders.
- Orders already in the ledger are refreshed when Shopify updates them, including a later refund. The sync cursor does not move forward if the page cap is hit.
- A new seller id creates a vendor: not VAT-registered, payout method Stripe Connect, no connected account yet. Own products and gift hampers still get no vendor.
- Vendors can be created, updated, and deactivated. Deactivate does not delete history. Bank details stored here are a label and the last 4 digits.
- Pack execute sends Stripe Connect lines only. Manual-bank lines wait for **Mark paid**. That records `NE-YYYY-MM-<vendor>`, the approver, and a payment advice. It does not call Stripe. A second execute does not pay a Connect line again. Mark paid on an already recorded line does nothing extra.
- Closed packs are still not regenerated. A line that already has a transfer keeps that paid amount.

## What you do each month

Webhooks and the backup sync fill the ledger. You still generate the Dubai month, submit it, and approve it as admin@nirvanearth.com. Then execute Connect transfers, and mark manual bank lines paid after the bank payment.

## Not verified against a live shop order in this change

The webhook handler and the paginated sync are covered by unit tests. A paid order placed on `t91jg6-qq.myshopify.com` was not placed during this change, so the one-to-two-minute appearance on `/orders` still needs one real paid test order after deploy. Webhook registration runs when `APP_URL` is https and the shop session is connected.

Seller properties accepted are the names in `docs/FIELD_MAPPING.md`, plus `WEBKUL_PROPERTY_NAMES`. A fresh copy of a live Webkul line was not downloaded for this note.
