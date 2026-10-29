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

A successful Stripe transfer creates a payment advice. Download it from the pack line, or `GET /api/lines/<settlementLineId>/invoice`. The advice number looks like `NE-SA-2026-10-desert-001`. The app emails admin@nirvanearth.com and, when the vendor row has an email, that vendor. With no `RESEND_API_KEY` the messages stay in the outbox. Stripe and Connect fees are not deducted from the net.

## Rules

Open Rules in the admin UI. Save a draft, submit it, then approve it as admin@nirvanearth.com. The active version is stored on the pack when that pack is generated. Regenerating a pack that is still draft picks up the active version. A closed pack cannot be regenerated, and packed lines are not recalculated, so its commission stays as stored. The first active version is seeded from the current env defaults as `2026-10-28`. Editing the active row in place is rejected; save a new draft instead.

## Own-product report

Own products and gift hampers stay out of vendor packs. Home → Own sales, or `GET /api/reports/owner?period=YYYY-MM`, lists their gross, discounts, and tax. Add `format=csv` for a download. The report has no vendor net and no transfer id.

## Bank payouts

After a transfer, the line shows **In connected account**. A Stripe `payout.paid` or `payout.failed` webhook (`POST /api/stripe/webhook`, signature required) updates that to **Paid to bank** or **Bank payout failed**. UAE bank arrival is often about five days, and the connected account needs a verified bank account. The button **Request bank payout** calls the Stripe Payout API on the connected account only when `ENABLE_PAYOUT_TRIGGER=true`. It stays off by default. Live keys still cannot boot unless the existing live-transfer guard is explicitly enabled, and this app does not pay an arbitrary IBAN from the platform balance.
