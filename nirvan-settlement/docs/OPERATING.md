# Operating the monthly cycle

Test mode until `admin@nirvanearth.com` writes a go-live approval.

1. Sync paid orders (`npm run sync:orders` or `npm run sync -- --days=30`) or wait until orders are already in the ledger. Shopify needs `SHOPIFY_ADMIN_TOKEN`. `npm run enrich` refills vendor and commission fields from stored orders.
2. Confirm vendors. Set VAT and the test Stripe Custom account id. Own products and gift hampers never get a vendor line.
3. On or after the 10th, generate the pack for the previous calendar month (Dubai). Example: `npm run pack -- 2026-09`.
4. The pack lists payable lines and held lines. Held lines are still inside the return window or have an open refund, chargeback, or dispute.
5. Submit the pack. The approver gets an email (or an outbox row, if no email provider is configured).
6. Sign in as `admin@nirvanearth.com` and approve the payable lines.
7. Execute transfers: `npm run execute -- --pack=<id>` or the button in the ledger.
8. A failed line stays on the pack. Fix the destination or balance, then execute again. The idempotency key `transfer:<settlement_line_id>` stops a second payout.
9. Lines that were held roll into a later month once they qualify. Do not regenerate a pack after it has left draft.

Shipping is shown on the order and is not part of vendor net until the client assigns it.

Do not change the Shopify gateway or the Stripe payout schedule.
