# Operating the monthly cycle

Test mode until `admin@nirvanearth.com` writes a go-live approval.

1. Sync paid orders (`npm run sync:orders` or `npm run sync -- --days=30`) or wait until orders are already in the ledger. Shopify needs `SHOPIFY_ADMIN_TOKEN`. `npm run enrich` refills vendor and commission fields from stored orders.
2. Confirm vendors. Set VAT and the test Stripe Custom account id. Own products and gift hampers never get a vendor line.
3. On or after the 10th, generate the pack for the previous calendar month (Dubai). Example: `npm run pack -- 2026-09`.
4. The pack lists payable lines and held lines. Held lines are still inside the return window or have an open refund, chargeback, or dispute.
5. Submit the pack. The approver gets an email at `admin@nirvanearth.com` (or an outbox row, if `RESEND_API_KEY` is not set). The test from-address may be the provider's test sender, for example `onboarding@resend.dev`. A Nirvan Earth domain sender is not configured. Propose that SMTP domain to the client before production. Do not send settlement mail to customers. The only vendor email is the payment advice created after a successful transfer.
6. Sign in as `admin@nirvanearth.com` and approve the payable lines.
7. Execute transfers: `npm run execute -- --pack=<id>` or the button in the ledger.
8. A failed line stays on the pack. Fix the destination or balance, then execute again. The idempotency key `transfer:<settlement_line_id>` stops a second payout.
9. Lines that were held roll into a later month once they qualify. Do not regenerate a pack after it has left draft.

Shipping is shown on the order and is not part of vendor net until the client assigns it.

Do not change the Shopify gateway or the Stripe payout schedule.

## Invoices

A successful Stripe transfer creates a payment advice. Download it from the pack line, or `GET /api/lines/<settlementLineId>/invoice`. The advice number looks like `NE-SA-2026-10-desert-001`. The app emails that advice to admin@nirvanearth.com only. Vendor addresses are stored as blocked and are not sent. With no `RESEND_API_KEY` the admin messages stay in the outbox and `provider_message_id` is empty. A Resend accept stores the `re_` id on the email row and on the audit event. Stripe and Connect fees are not deducted from the net.

## Rules

Open Rules in the admin UI. Save a draft, submit it, then approve it as admin@nirvanearth.com. The active version is stored on the pack when that pack is generated. Regenerating a pack that is still draft picks up the active version. A closed pack cannot be regenerated. The first active version is seeded from the current env defaults as `2026-10-28`. Editing the active row in place is rejected; save a new draft instead.

Requalify (`POST /api/requalify`, or the Requalify button on Orders) recalculates open and packed lines under the active rules, including VAT added back into vendor net. A line that already has a Stripe transfer keeps the paid settlement amount and the transfer id. The order row shows the rule net. The pack row shows that rule net and, when they differ, the amount already paid. The difference is written to the audit as `line.requalify.transferred_unchanged`. Requalify does not start a second transfer. Execute remains idempotent: a transferred line is skipped.

## Own-product report

Own products and gift hampers stay out of vendor packs. Home → Own sales, or `GET /api/reports/owner?period=YYYY-MM`, lists their gross, discounts, and tax. Add `format=csv` for a download. The report has no vendor net and no transfer id.

## Bank payouts

After a transfer, the line shows **In connected account**. A Stripe `payout.paid` or `payout.failed` webhook (`POST /api/stripe/webhook`, signature required) updates that to **Paid to bank** or **Bank payout failed**. UAE bank arrival is often about five days, and the connected account needs a verified bank account. The button **Request bank payout** calls the Stripe Payout API on the connected account only when `ENABLE_PAYOUT_TRIGGER=true`. It stays off by default. Live keys still cannot boot unless the existing live-transfer guard is explicitly enabled, and this app does not pay an arbitrary IBAN from the platform balance.
