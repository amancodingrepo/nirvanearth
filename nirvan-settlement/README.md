# Nirvan Earth settlement

Test-mode settlement for Shopify + Webkul + Stripe Connect.

Paid AED orders are ingested, commissioned at 20% of product value after discount and excluding vendor VAT, and grouped into a Dubai calendar-month pack. `admin@nirvanearth.com` approves the pack. The app then creates one Stripe Transfer per vendor. Own products and gift hampers are excluded. Shipping is stored separately and is not paid out.

Live keys and live transfers stay blocked until a written go-live email.

## Run

```bash
npm install
npm run db:push
npm run db:push:test
npm test
npm run seed:demo
npm run dev
```

Ledger: http://localhost:3000

| Manual command | npm |
|----------------|-----|
| `node scripts/stripe-ping.js` | same, from the repo root |
| `node scripts/sync-orders.js` | `npm run sync:orders` — optional `--days=30` |
| `node scripts/generate-pack.js 2026-10` | same |
| `node scripts/execute-transfers.js --pack=<id>` | same |

## Layout

```text
apps/api           Fastify API, jobs, Prisma
apps/web           Settlement ledger (static)
packages/rules     Commission, VAT, qualification
docs               Rules, operating steps, handover, test results
```

See `docs/OPERATING.md` for the monthly cycle.
