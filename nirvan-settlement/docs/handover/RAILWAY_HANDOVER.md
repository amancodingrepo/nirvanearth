# Railway handover — Nirvan Earth settlement

The settlement app is the Railway service `nirvanearth` in project `enchanting-renewal`. Production URL: `https://nirvanearth-production.up.railway.app`. Admin sign-in is that URL, then the login form. The approver is `admin@nirvanearth.com`.

This document is the ownership pack. It does not include secret values. Live Stripe keys and live transfers stay off.

## Own the project

Nirvan Earth can take the existing project or recreate it.

### Transfer the existing project

1. Sign in to Railway as the current owner (the account that created `enchanting-renewal`).
2. Open the project, then Settings, then Members. Invite the Nirvan Earth Railway user as Admin.
3. After that user can open the project, transfer ownership if Railway offers it, or leave Nirvan Earth as Admin and remove the previous owner once they confirm deploys and logs work.
4. Confirm the GitHub repo `amancodingrepo/nirvanearth` is connected, root directory `nirvan-settlement`, and production deploys from `main`.
5. Confirm the Postgres service and its volume stay attached. Do not delete the volume. That database holds packs, transfers, and audit rows.
6. Set billing to the Nirvan Earth Railway workspace before the previous card is removed.

### Recreate instead of transfer

1. Create a new Railway project with a Postgres service and a Node service.
2. Connect the same GitHub repo. Set the service root to `nirvan-settlement`.
3. Copy environment variable **names** from the list below. Paste the values from a password manager, not from git or from this file.
4. Set `APP_URL` to the new public `https` URL before the first boot so Shopify webhooks register on that host.
5. Boot runs `prisma db push`, then the seed, then the server. The seed creates the approver and the active rule row. It does not rebuild closed packs.
6. In Shopify admin, point the custom app webhook target at `https://<new-host>/api/shopify/webhooks` for `orders/paid`, `orders/updated`, and `refunds/create`. Use the same `SHOPIFY_API_SECRET` the app uses to check the signature.
7. Leave `ALLOW_LIVE` and `ALLOW_LIVE_TRANSFERS` unset or `false`. Use the test secret key only.

## Cost

Hobby usage for this app and a small Postgres volume is about **USD 5–15 per month**. The bill moves with CPU, memory, and database storage. It is not a fixed invoice from this repository.

## Environment variable names

Set these on the Railway service. Do not commit the values.

- `DATABASE_URL`
- `NODE_ENV`
- `APP_URL`
- `ADMIN_PASSWORD`
- `SESSION_SECRET`
- `APPROVER_EMAILS`
- `NOTIFY_EMAIL`
- `EMAIL_FROM`
- `RESEND_API_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `ALLOW_LIVE`
- `ALLOW_LIVE_TRANSFERS`
- `ENABLE_PAYOUT_TRIGGER`
- `SHOPIFY_SHOP`
- `SHOPIFY_API_KEY`
- `SHOPIFY_API_SECRET`
- `SHOPIFY_ADMIN_TOKEN`
- `SHOPIFY_SCOPES`
- `RETURN_WINDOW_DAYS`
- `COMMISSION_RATE`
- `PLATFORM_OWN_TAGS`
- `PLATFORM_OWN_VENDOR_NAMES`
- `PLATFORM_OWN_PRODUCT_IDS`
- `WEBKUL_PROPERTY_NAMES`
- `SYNC_INTERVAL_MS`
- `ENABLE_SYNC_INTERVAL`

`STRIPE_SECRET_KEY` must be `sk_test_` or `rk_test_` until a written go-live approval. The process refuses `sk_live_` and `rk_live_` unless `ALLOW_LIVE` or `ALLOW_LIVE_TRANSFERS` is `true`, and it still refuses live keys outside production.

## App URL, admin, Shopify

- App: `https://nirvanearth-production.up.railway.app`
- Health: `GET /api/health` (no key values)
- Admin: open the app URL and sign in as `admin@nirvanearth.com`
- Shop: `t91jg6-qq.myshopify.com`
- Webhooks: `POST /api/shopify/webhooks`, HMAC checked with `SHOPIFY_API_SECRET`
- Topics: `orders/paid`, `orders/updated`, `refunds/create`
- Startup registers those topics when `APP_URL` is `https` and the shop session is connected
- A sync about every 20 minutes is the backup. `POST /api/sync` still backfills paid orders

## Stripe test and a future live switch

Today the service is test mode. Health should show `liveTransfersBlocked: true`. Do not put a live secret in `STRIPE_SECRET_KEY`. Do not set `ALLOW_LIVE` or `ALLOW_LIVE_TRANSFERS`. Connect transfers in this app use the test platform balance and test `acct_` ids.

A later live switch needs all of the following, in writing, from `admin@nirvanearth.com`:

1. The Shopify-linked Nirvan Earth Stripe platform, with Connect enabled.
2. Live vendor `acct_` ids after the UAE onboarding in `STRIPE_CONNECT_UAE_VENDOR_ONBOARDING.md`.
3. `EMAIL_FROM` on a verified Nirvan Earth domain.
4. Explicit approval to set live keys and `ALLOW_LIVE_TRANSFERS`.

Until that note exists, this handover is not approval to take live payments or live transfers.

## Monthly operating checklist

1. Confirm `/api/health`: database up, Shopify connected, Stripe test, live transfers blocked.
2. On or after the 10th (Asia/Dubai), generate the previous month's pack.
3. Read payable and held lines. Held lines are still in the return window or have an open refund, chargeback, or dispute.
4. Submit the pack. `admin@nirvanearth.com` receives the notice.
5. Sign in as `admin@nirvanearth.com` and approve.
6. Execute. Stripe Connect lines transfer from the test balance. Manual-bank lines become **awaiting manual payment** and are not sent to Stripe.
7. Pay a manual vendor from the bank. Mark paid with the reference. That records the payment and creates the payment advice. It does not create a Stripe transfer.
8. Download the advice. Confirm the audit has Resend message ids for the admin copy and the vendor copy.
9. Do not regenerate a pack after it has left draft. A second execute does not pay a transferred line again. A closed pack returns 409.
