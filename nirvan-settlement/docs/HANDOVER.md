# Handover

| Item | Value |
|------|--------|
| Shop | `t91jg6-qq.myshopify.com` / www.nirvanearth.com |
| Stripe platform | `acct_1TxOZVK0wm8bsReE` |
| Approver | `admin@nirvanearth.com` |
| Agreement | NE-SA-2026-09-V3 |
| Mode | Test. Live keys are refused unless `ALLOW_LIVE=true` or `ALLOW_LIVE_TRANSFERS=true` after a written go-live email. |
| Host | Not chosen. Run locally or on a client-owned host (Railway, Render, Fly, or similar) plus managed Postgres. |
| Owner at go-live | Nirvan Earth |
| Monthly host cost | Set when the client picks the host. Local Postgres is already used for this build. |
| Admin | Emails in `APPROVER_EMAILS`. Password is `ADMIN_PASSWORD` in the server env, not in git. |
| Support contact | contact@ermsintelligence.com |
| Fee | INR 50,000 |
| Support window | 6 months of in-scope defects after production deploy |

## Keys

- Shopify Admin token and Stripe test secret live in `apps/api/.env`.
- Rotate by replacing those values and restarting the process.
- Never commit `.env`.

## Run

```bash
npm install
npm run db:push
npm run seed:demo
npm run dev
```

Open http://localhost:3000. Demo password is the `ADMIN_PASSWORD` in `apps/api/.env`.

Webkul seller fields are discovered from line properties, a `sellerKey::sku` prefix, or the Shopify vendor name. Replace `parseSellerSignal` once the shop shows the real Webkul field.
