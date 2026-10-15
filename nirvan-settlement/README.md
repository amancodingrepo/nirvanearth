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

## Shopify OAuth Setup

1. In the **Shopify Dev / Partner Dashboard** (for app *Nirvan Settlement Sync*):
   - **App URL**: `https://nirvanearth-production.up.railway.app`
   - **Allowed redirection URL(s)**:
     `https://nirvanearth-production.up.railway.app/shopify/callback`
     *(For local development, also add: `http://localhost:3000/shopify/callback`)*
   - **Scopes**: `read_orders,read_products,read_fulfillments,read_merchant_managed_fulfillment_orders`
2. Add your **Client ID** and **Client Secret** into the environment:
   ```env
   SHOPIFY_SHOP=t91jg6-qq.myshopify.com
   SHOPIFY_API_KEY=your_client_id
   SHOPIFY_API_SECRET=your_client_secret
   APP_URL=https://nirvanearth-production.up.railway.app
   ```
3. Authorize once:
   - Visit `https://nirvanearth-production.up.railway.app/shopify/auth` (or `http://localhost:3000/shopify/auth`).
   - Log in and grant permissions.
   - Upon redirect to `/shopify/callback`, the app exchanges the temporary authorization code for an offline access token and saves it securely in the database (`shop_sessions` table).
   - Once connected, order sync and product tag queries automatically authenticate via `X-Shopify-Access-Token`.

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
