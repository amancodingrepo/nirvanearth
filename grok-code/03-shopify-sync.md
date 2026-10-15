# 03 — Shopify sync

## Goal

Read paid orders from Shopify Admin API into `order_snapshots` and `order_lines`.

## Env

```bash
SHOPIFY_SHOP=t91jg6-qq.myshopify.com
SHOPIFY_ADMIN_TOKEN=shpat_...
```

## API

- REST: `GET /admin/api/2024-10/orders.json?status=any&financial_status=paid&limit=50`  
- Or GraphQL `orders` with line items, discount allocations, shipping, refunds, fulfillments.

## For each paid order

1. Upsert `order_snapshots` by `shopify_order_id`.  
2. For each line item:  
   - Map money: gross, discount, quantity, title  
   - `vendor_vat` = 0 initially (refine when tax lines known)  
   - `shipping_amount` = allocate later or 0 on line; store order-level shipping on first line or separate field  
   - Leave `vendor_id` null until Webkul module  
   - `is_platform_own` = false until Webkul/own-product module  
3. From fulfillments: set `fulfilled_at` on lines when possible.  
4. From refunds: insert `adjustments` type `refund`.  

## Idempotent

Re-running sync must update existing rows, not duplicate lines (`UNIQUE shopify_order_id + shopify_line_id`).

## Script

```bash
npm run sync:orders
# or
python -m app.jobs.sync_orders
```

## Agent tasks

1. Shopify client with token.  
2. Parser from Shopify JSON → DB rows.  
3. CLI command to sync last N days.  
4. Log counts: orders upserted, lines upserted.

## Done when

One real paid order from the shop appears in DB with correct line count and product totals within 0.01 AED of Shopify.
