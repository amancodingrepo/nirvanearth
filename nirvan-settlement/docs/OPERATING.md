# Operating the monthly cycle

Test mode until `admin@nirvanearth.com` writes a go-live approval.

1. Paid orders arrive on their own. Shopify sends `orders/paid`, `orders/updated`, and `refunds/create` to `POST /api/shopify/webhooks`. The signature is checked with `SHOPIFY_API_SECRET`. On a host whose `APP_URL` is https, startup registers those topics when the shop is connected. A sync every 20 minutes (`SYNC_INTERVAL_MS`, disable with `ENABLE_SYNC_INTERVAL=false`) is the safety net. **Sync now** (`POST /api/sync` or `npm run sync:orders`) still backfills. It pages through paid orders with Shopify's cursor, then refreshes orders already in the ledger that changed. `npm run enrich` refills vendor and commission fields from stored orders.
2. Confirm vendors. A new seller id creates a vendor with VAT off and payout method Stripe Connect. Set VAT if they are registered. Set payout to **manual bank** when there is no Connect account, and keep only a bank label and last 4 digits. Stripe Connect vendors need an `acct_` id before execute. Own products and gift hampers never get a vendor line.
3. On or after the 10th, generate the pack for the previous calendar month (Dubai). Example: `npm run pack -- 2026-09`.
4. The pack lists payable lines and held lines. Held lines are still inside the return window or have an open refund, chargeback, or dispute.
5. Submit the pack. The approver gets an email at `admin@nirvanearth.com` (or an outbox row, if `RESEND_API_KEY` is not set). Do not send settlement mail to customers. After a successful Connect transfer or a recorded manual bank payment, the payment advice is emailed to `admin@nirvanearth.com` and to the vendor's registered email. Pack submit, approve, and execute notices stay with the approver.
6. Sign in as `admin@nirvanearth.com` and approve the payable lines.
7. Execute Connect transfers: `npm run execute -- --pack=<id>` or the button in the ledger. That sends Stripe Connect lines only. Manual-bank lines move to **awaiting manual payment** and are not sent to Stripe. Mark paid stores the reference `NE-YYYY-MM-<vendor>`, the actor, and a payment advice. Mark paid does not create a transfer. Running execute again does not pay a Connect line twice.
8. A failed Connect line stays on the pack. Fix the destination or balance, then execute again. The idempotency key `transfer:<settlement_line_id>` stops a second payout. A failed attempt uses `transfer:<lineId>:retry:<failedAttempts>`.
9. Lines that were held roll into a later month once they qualify. Do not regenerate a pack after it has left draft.

Checkout shipping is platform shipping. It is not part of vendor net. Embedded delivery allowance on a third-party line is paid to that vendor and is excluded from the commission base.

Do not change the Shopify gateway or the Stripe payout schedule.

## Invoices

A successful Stripe transfer or a recorded manual bank payment creates a payment advice. Download it from the pack line, or `GET /api/lines/<settlementLineId>/invoice`. The advice number looks like `NE-SA-2026-10-desert-001`. The app emails that advice to admin@nirvanearth.com and to the vendor's registered email. With no `RESEND_API_KEY` the messages stay in the outbox. When Resend accepts the send, the provider id (`re_` or a UUID) is stored on the email row and on the audit event. Checkout gateway fees, Connect transfer fees, and bank payout fees are borne by Nirvan Earth and are not deducted from the net. The advice states that.

## Rules

Open Rules in the admin UI. Save a draft, submit it, then approve it as admin@nirvanearth.com. The active version is stored on the pack when that pack is generated. Regenerating a pack that is still draft picks up the active version. A closed pack cannot be regenerated. The first active version is seeded from the current env defaults. The code lock dated 11 Nov 2026 is `2026-11-11`. On a database that already has an older active row, save and approve a new version labelled `2026-11-11` so later packs record it. The allowance-to-vendor calculation is in the rules package and applies when open lines are requalified. Editing the active row in place is rejected; save a new draft instead.

Requalify (`POST /api/requalify`, or the Requalify button on Orders) recalculates open and packed lines under the active rules, including VAT added back into vendor net. A line that already has a Stripe transfer keeps the paid settlement amount and the transfer id. The order row shows the rule net. The pack row shows that rule net and, when they differ, the amount already paid. The difference is written to the audit as `line.requalify.transferred_unchanged`. Requalify does not start a second transfer. Execute remains idempotent: a transferred line is skipped.

## Own-product report

Own products and gift hampers stay out of vendor packs. Home → Own sales, or `GET /api/reports/owner?period=YYYY-MM`, lists their gross, discounts, and tax. Add `format=csv` for a download. The report has no vendor net and no transfer id.

## Own-product delivery in Shopify

Configure this in Shopify. The settlement app does not add a second charge.

1. Put Nirvan Earth own products in their own shipping profile.
2. On that profile, add a flat rate of AED 19 with a price condition for an own-product subtotal under AED 199.
3. Add a free rate for an own-product subtotal of AED 199 or more.
4. Put third-party products in a separate profile with a AED 0 rate. The vendor packs and delivers. The embedded allowance is inside the product price.
5. Leave Webkul per-seller shipping off, or set each third-party seller rate to 0. Otherwise checkout can add a vendor shipping fee on top of the allowance.
6. Mixed carts: Shopify adds one rate from each profile. The customer should see a single AED 19, or free, from the own-product profile, and nothing from the third-party profile. Do not also add AED 19 with a cart script.

The ledger stores the checkout shipping total as platform shipping. It stores the own-product subtotal and the expected AED 19 or 0. Vendor commission uses neither figure. If `shipping_lines` does not match the expected own-product fee, the ingest audit is `order.shipping.review`.

This task does not change the live Shopify shipping profiles. Nirvan Earth applies the profile setup above.

## NE1001

NE1001 is a paid Shopify order from 2 August 2026, before this integration. Do not backfill it. Webhooks `orders/paid`, `orders/updated`, and `refunds/create`, plus the sync, cover orders after the app was connected. NE1002 and NE1003 are already in the ledger as own sales with vendor net 0.

## Bank payouts

After a transfer, the line shows **In connected account**. A Stripe `payout.paid` or `payout.failed` webhook (`POST /api/stripe/webhook`, signature required) updates that to **Paid to bank** or **Bank payout failed**. UAE bank arrival is often about five days, and the connected account needs a verified bank account. The button **Request bank payout** calls the Stripe Payout API on the connected account only when `ENABLE_PAYOUT_TRIGGER=true`. It stays off by default. Live keys still cannot boot unless the existing live-transfer guard is explicitly enabled, and this app does not pay an arbitrary IBAN from the platform balance.
