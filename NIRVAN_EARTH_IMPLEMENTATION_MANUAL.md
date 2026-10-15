# Nirvan Earth Settlement — Full Implementation Manual

**How to build everything, in order.**  
Test mode only until Client writes go-live approval.

| Item | Value |
|------|--------|
| Shop | `t91jg6-qq.myshopify.com` / www.nirvanearth.com |
| Stripe platform | `acct_1TxOZVK0wm8bsReE` |
| Approver | `admin@nirvanearth.com` |
| Agreement | NE-SA-2026-09-V3 |
| Commencement | 11 October 2026 |

---

## 0. Before you write code

### 0.1 Access checklist

- [ ] Shopify admin opens with collaborator login  
- [ ] Webkul Multi Vendor opens under **Apps** (admin menus: sellers, payments, commissions)  
- [ ] Stripe **test** key works (`sk_test_…` or restricted test key)  
- [ ] You can create a test Custom account and a test Transfer  

### 0.2 Discover these in Day 1 (write them down)

1. How Webkul marks the **seller on each order line** (line property, vendor field, metafield, SKU prefix).  
2. How **Nirvan Earth own products / gift hampers** are identified (tag, product type, vendor = "Nirvan Earth", product ID list).  
3. Default **return window** days (ask Client if not 14).  
4. Currency: **AED** (amounts in fils: multiply by 100 for Stripe).  

### 0.3 Hard rules while building

- Test keys only.  
- No change to live payout schedule, gateway, or Connect settings.  
- No Transfer without approval flow in the tool.  
- Own products never get a vendor settlement line.  

---

## 1. Project setup

### 1.1 Create repo

```text
nirvan-settlement/
  apps/api/          # backend API + jobs
  apps/web/          # admin UI (approvals, statements)
  packages/rules/    # pure calculation functions + unit tests
  docs/
  .env.example
  README.md
```

### 1.2 Choose stack (recommended simple path)

| Layer | Suggestion |
|-------|------------|
| API | Node + Fastify/Express **or** Python + FastAPI |
| UI | Next.js or simple React admin |
| DB | Postgres |
| ORM | Prisma / Drizzle / SQLAlchemy |
| Stripe | Official SDK |
| Shopify | Admin REST or GraphQL with collaborator token |
| Email | Resend / Postmark / SES |
| Host (later) | Railway / Render / Fly + managed Postgres |

### 1.3 Environment

```bash
DATABASE_URL=postgresql://...

SHOPIFY_SHOP=t91jg6-qq.myshopify.com
SHOPIFY_ADMIN_TOKEN=shpat_...

STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...

APPROVER_EMAILS=admin@nirvanearth.com
NOTIFY_EMAIL=admin@nirvanearth.com
EMAIL_FROM=settlement@yourdomain.com

RETURN_WINDOW_DAYS=14
COMMISSION_RATE=0.20
PLATFORM_OWN_TAGS=nirvan-own,gift-hamper
# or PLATFORM_OWN_VENDOR_NAMES=Nirvan Earth
# or PLATFORM_OWN_PRODUCT_IDS=gid://shopify/Product/123,...

APP_URL=http://localhost:3000
```

Never commit real secrets.

### 1.4 Database migrations

Create tables from section 2 below. Run migrate. Seed one admin user mapped to `admin@nirvanearth.com` for local approval tests.

---

## 2. Data model (implement first)

### 2.1 Tables

**vendors**  
`id`, `name`, `email`, `vat_registered` (bool), `stripe_account_id`, `active`, `created_at`

**order_snapshots**  
`id`, `shopify_order_id` (unique), `order_number`, `currency`, `paid_at`, `financial_status`, `fulfillment_status`, `raw_json`, `created_at`

**order_lines**  
`id`, `shopify_order_id`, `shopify_line_id`, `vendor_id` (nullable), `is_platform_own` (bool),  
`title`, `quantity`,  
`gross`, `discount`, `product_net`, `vendor_vat`, `shipping_amount`,  
`commission_base`, `commission_amount`, `vendor_net`,  
`fulfilled_at`, `return_window_ends_at`,  
`status` (`open` | `blocked` | `qualified` | `packed`)

**adjustments**  
`id`, `order_line_id` or `shopify_order_id`, `type` (`refund`|`chargeback`|`dispute`|`other`),  
`amount`, `status` (`open`|`resolved`), `resolved_at`

**month_packs**  
`id`, `year_month` (`2026-10`), `status` (`draft`|`pending_approval`|`approved`|`executing`|`closed`)

**settlement_lines**  
`id`, `month_pack_id`, `vendor_id`,  
`commission_base_sum`, `commission_sum`, `vendor_net_sum`,  
`status` (`blocked`|`qualified`|`approved`|`transferred`|`failed`),  
`stripe_transfer_id` nullable

**approvals**  
`id`, `entity_type`, `entity_id`, `actor_email`, `decision`, `created_at`

**audit_events**  
`id`, `action`, `actor_email`, `payload_json`, `created_at`

**transfer_attempts**  
`id`, `settlement_line_id`, `idempotency_key` (unique), `amount`,  
`stripe_transfer_id`, `status`, `error`, `created_at`

### 2.2 Indexes

- Unique: `order_snapshots.shopify_order_id`  
- Unique: `transfer_attempts.idempotency_key`  
- Index: `order_lines.shopify_order_id`, `settlement_lines.month_pack_id`

---

## 3. Rules engine (pure functions — unit test these)

File: `packages/rules/commission.ts` (or `.py`)

### 3.1 Commission

```text
product_net_ex_vat = product_selling_after_discount - vendor_vat
commission = round_money(product_net_ex_vat * 0.20)
vendor_net = product_net_ex_vat - commission
```

- Currency: AED → store major units in DB as decimal(12,2); Stripe uses integer **fils** (`amount * 100`).  
- Shipping: **not** inside `product_net_ex_vat`. Store separately.  
- Own product: skip vendor commission entirely (`is_platform_own = true`).

### 3.2 Qualification

```text
qualified =
  is_platform_own == false
  AND vendor_id is set
  AND fulfilled_at is set
  AND now > return_window_ends_at
  AND no open adjustments on line/order
```

### 3.3 Unit tests (required)

| Case | Input | Expect |
|------|--------|--------|
| Basic | 100 after discount, 0 VAT | base 100, commission 20, net 80 |
| Discount | list 100, discount 10 | base 90, commission 18 |
| VAT | net 100 + VAT 5 | base 100 (ex VAT), commission 20 |
| Own product | flag true | no vendor line |
| Shipping 15 | — | shipping field 15, not in base |
| Open refund | — | not qualified |

Run tests on every commit.

---

## 4. Shopify integration

### 4.1 Auth

Use Admin API access token from collaborator app / custom app installed on the shop.

### 4.2 Pull orders

```text
GET /admin/api/2024-10/orders.json?status=any&financial_status=paid&limit=50
```

Or GraphQL `orders` query with line items, discounts, shipping, refunds.

For each paid order:

1. Upsert `order_snapshots`.  
2. For each line item → upsert `order_lines` with money fields.  
3. Map vendor (section 5).  
4. Detect own product (tags / vendor / ID list from config).  
5. Set `fulfilled_at` from fulfillment; compute `return_window_ends_at`.  
6. Sync refunds into `adjustments`.

### 4.3 Webhooks (optional but better)

Subscribe (via custom app when Client allows): `orders/paid`, `orders/updated`, `refunds/create`.  
Until then, **poll** every 15–60 minutes in test.

### 4.4 Manual verify

- One real paid order appears in your DB with correct lines and totals.  
- Gateway on order is Stripe-related (informational).

---

## 5. Webkul seller mapping

### 5.1 Find the seller id on a line

In Shopify admin + Webkul, open a multi-seller order and note:

- Line item `vendor` field, or  
- Line `properties` / attributes Webkul adds, or  
- SKU / barcode pattern, or  
- Metafield  

Put the parser in one function: `resolveVendor(line) → vendor_id | null`.

### 5.2 Vendor table

- On first see of a Webkul seller → create `vendors` row (`vat_registered` default false until Client sets it).  
- For **test**: create 2 dummy vendors in DB + matching Stripe test Custom accounts.

### 5.3 Own products

```text
is_platform_own =
  product has tag in PLATFORM_OWN_TAGS
  OR vendor name in PLATFORM_OWN_VENDOR_NAMES
  OR product id in PLATFORM_OWN_PRODUCT_IDS
```

If true: `vendor_id = null`, never add to settlement_lines.

---

## 6. Stripe Connect (test)

### 6.1 Create test Custom account (dummy vendor)

```text
stripe.accounts.create({
  type: 'custom',
  country: 'AE',
  capabilities: { transfers: { requested: true } },
  business_type: 'company',
  // test mode: minimal fields as required by API
})
```

Save `acct_…` on `vendors.stripe_account_id`.

### 6.2 Transfer after approval

```text
stripe.transfers.create({
  amount: fils,              // vendor_net_sum * 100
  currency: 'aed',
  destination: connectedAccountId,
  metadata: {
    settlement_line_id: '...',
    year_month: '2026-10',
  },
}, {
  idempotencyKey: `transfer:${settlement_line_id}`,
})
```

- On success: save `stripe_transfer_id`, status `transferred`.  
- On failure: status `failed`, store error; allow controlled retry with **new** attempt row but same business rule (only if not already transferred).  
- Second call with same idempotency key must not double-pay.

### 6.3 Do not

- Do not set live payout schedules.  
- Do not use live secret key.  
- Do not Transfer before `settlement_lines.status === 'approved'`.

---

## 7. Month pack + settlement lines

### 7.1 Generate pack

Job or button: **Generate month pack** for `YYYY-MM`.

1. Select all `order_lines` with `paid_at` in that calendar month (or fulfilment month — **use paid_at month unless Client says otherwise**; default **paid_at**).  
2. Recompute qualification.  
3. Group by `vendor_id` where not platform own.  
4. Sum `commission_base`, `commission_amount`, `vendor_net` for qualified lines.  
5. Create `month_packs` + `settlement_lines` (qualified and blocked listed separately).  
6. Status `draft`.

### 7.2 Submit for approval

- Status → `pending_approval`.  
- Email `admin@nirvanearth.com`: pack id, month, vendor count, total net.  
- Audit event `pack.submitted`.

### 7.3 Approve

- Only if `actor_email` ∈ `APPROVER_EMAILS`.  
- Approve whole pack or per settlement line (implement **per line** if possible; pack-level OK for v1).  
- Status → `approved`.  
- Email + audit.

### 7.4 Execute Transfers

- For each approved settlement line with `stripe_account_id` and `vendor_net_sum > 0`:  
  - Create Transfer (section 6.2).  
  - Email on execute.  
- Pack status → `executing` then `closed` when all done/failed handled.

### 7.5 Unqualified lines

Stay `blocked`; next month job can re-evaluate when return window ends / disputes resolve.

---

## 8. Admin UI (minimum screens)

1. **Login** — simple auth; only Erms + Client approvers.  
2. **Dashboard** — current month pack status.  
3. **Orders / lines** — list ingested lines, vendor, status.  
4. **Month pack** — lines by vendor, totals, Approve button.  
5. **Vendors** — list, VAT flag, Stripe account id (test).  
6. **Audit** — recent events.  

Emails are mandatory even if UI is minimal.

---

## 9. Email notifications

Send on:

| Event | Content |
|-------|---------|
| Pack submitted | Month, totals, link |
| Line/pack approved | Who, when, amounts |
| Transfer executed | Vendor, amount, Transfer id, success/fail |

Always to `NOTIFY_EMAIL=admin@nirvanearth.com`.

---

## 10. Implementation order (do this sequence)

```text
Step 1  Repo + DB + env
Step 2  Rules engine + unit tests
Step 3  Shopify order ingest (one order → DB)
Step 4  Webkul vendor resolve + own-product detect
Step 5  Qualification job
Step 6  Month pack generation
Step 7  Approval + email + audit
Step 8  Stripe test account + Transfer + idempotency
Step 9  Full test matrix (12 cases)
Step 10 Docs + handover notes
```

Do not build UI polish before Steps 2–8 work via API/scripts.

---

## 11. How to run the 12 test cases

Use **dummy data** in test Stripe + synthetic orders in DB if shop has no multi-vendor data yet.

| # | How to create | Pass if |
|---|---------------|---------|
| 1 Single vendor | 1 vendor, 1 paid line | 1 settlement line, correct 20% |
| 2 Mixed cart | 2 vendors on 1 order | 2 lines, 2 Transfers after approve |
| 3 Own product | line with own tag | no vendor settlement |
| 4 VAT vendor | vat_registered=true, vat amount set | VAT excluded from base |
| 5 Non-VAT | vat_registered=false | no VAT |
| 6 Discount | discount on line | base = after discount |
| 7 Refund | adjustment open before window end | blocked |
| 8 Chargeback | adjustment type chargeback open | blocked |
| 9 Success Transfer | approve + execute | transfer id stored, email sent |
| 10 Fail Transfer | invalid destination in test | status failed, no crash |
| 11 Duplicate | execute twice | one Transfer only |
| 12 Roll | window still in return window at month end | not in paid Transfer set |

Write results into `docs/TEST_RESULTS.md`.

---

## 12. Scripts to keep handy

```bash
# verify stripe test key
node scripts/stripe-ping.js

# pull last 10 shopify orders into DB
node scripts/sync-orders.js

# generate pack for 2026-10
node scripts/generate-pack.js 2026-10

# execute approved transfers (test)
node scripts/execute-transfers.js --pack=...
```

---

## 13. Documentation to write before handover

| File | Content |
|------|---------|
| `docs/CALCULATION_RULES.md` | Locked rules (copy from agreement) |
| `docs/OPERATING.md` | Monthly: sync → generate pack → Client approves → execute on/after 10th |
| `docs/HANDOVER.md` | Host URL, owner, monthly cost estimate, who has admin, how to rotate keys |
| `docs/TEST_RESULTS.md` | Matrix results |

---

## 14. Live cutover (later — not now)

Only after email from `admin@nirvanearth.com`:

1. Client finishes Connect **platform profile**.  
2. Client owns production host; you deploy.  
3. Switch env to **live** restricted key.  
4. Onboard real UAE Custom accounts (trade licence).  
5. First month on live data with same approval path.  
6. Still no gateway/payout setting changes without new approval.

---

## 15. Definition of done (test mode)

- [ ] Rules unit tests green  
- [ ] Orders sync from Shopify  
- [ ] Vendor mapping works  
- [ ] Own products excluded  
- [ ] Month pack + approval + email + audit  
- [ ] Test Transfers idempotent  
- [ ] 12 scenarios recorded  
- [ ] OPERATING + HANDOVER docs  
- [ ] Client written test acceptance  

---

## 16. Common pitfalls

| Pitfall | Fix |
|---------|-----|
| Commission includes VAT | Subtract VAT before 20% |
| Own product paid to “vendor” | `is_platform_own` gate |
| Double Transfer | Idempotency key per settlement_line |
| Transfer before return window | Qualification check |
| Using live key in dev | Separate env files; assert `sk_test` prefix in non-prod |
| Shipping inside commission | Separate field only |
| Mixed cart one Transfer | One Transfer **per vendor** settlement line |

---

*Follow this manual top to bottom. Prefer it over chat history when coding.*
