# Nirvan Earth Settlement — Grok Code Implementation Guide

**Project:** Shopify + Webkul + Stripe Connect marketplace settlement (UAE)  
**Client:** Nirvan Earth FZE  
**Agreement:** NE-SA-2026-09-V3  
**Commencement:** 11 October 2026  
**Mode now:** TEST only — no live keys, no live Transfers  

This file is the single brief for coding agents and developers. Follow it strictly.

---

## 1. Goal

Build a **settlement application** that:

1. Reads paid Shopify orders (and Webkul seller attribution).
2. Applies **approved calculation rules**.
3. Builds **calendar-month** vendor packs and statements.
4. Requires **approval** from `admin@nirvanearth.com` (Anik Bilala) in the tool.
5. After approval, creates **Stripe Transfers** (test mode first) from Nirvan Earth platform balance to vendor **Custom connected accounts**.
6. Emails `admin@nirvanearth.com` on initiate / approve / execute and keeps an **audit log**.

**Not in scope**

- Changing Shopify checkout or payment gateway  
- Webkul Stripe payment add-on  
- Live Stripe config (payouts, Connect settings) without written Client approval  
- Legal advice, Tap Payments, new marketing fee products (structure hooks only)

---

## 2. Existing systems (do not replace)

| System | Role | Account / ID |
|--------|------|----------------|
| Shopify | Checkout, orders, products | `www.nirvanearth.com` / `t91jg6-qq.myshopify.com` |
| Webkul Multi Vendor | Sellers, commissions UI, seller↔product mapping | Via Shopify Apps (admin) |
| Stripe | Charges on platform; Transfers to connected accounts | `acct_1TxOZVK0wm8bsReE` |
| Stripe correspondence | — | `admin@nirvanearth.com` |

- Platform **payouts already manual** — leave unchanged.  
- Charge path: Shopify **Stripe Card Payments** → this Stripe account.  
- Charge type for settlement: **Separate Charges and Transfers (SCT)**.  
- Connected accounts: **UAE Custom** only, licensed businesses (trade licence). No unlicensed individuals. No cross-border.

---

## 3. Locked calculation rules (approved)

Implement exactly:

| Rule | Definition |
|------|------------|
| Commission | **20%** of actual **product selling value after product/customer discounts**, **excluding vendor VAT** |
| VAT (registered vendor) | Show VAT **separately**; **not** in commission base |
| VAT (non-registered) | No vendor VAT |
| Own products / gift hampers | Fulfilled by Nirvan Earth → **not** third-party vendor sales; **no** vendor commission/settlement line |
| Shipping | **Separate** from 20% commission |
| Stripe / payment / Connect fees | **Borne by Nirvan Earth**; show separately on statement (not deducted from vendor net unless rules change later) |
| Qualification | Only after **fulfilment** + **expiry of return window** + **no open** return / refund / chargeback / dispute / related liability |
| Timing | Qualified amounts targeted for Transfer on **10th of following month**, after tool approval + **available** Stripe balance; else roll to later cycle |
| Future fees | Listing / campaign / featured: **separate line types**, not in 20% commission; **not activated** now |
| Approver | Only process settlement approvals for users mapped to **admin@nirvanearth.com** (extendable list later) |

**Formula (per vendor line, simplified)**

```text
product_net_ex_vat = (line_price_after_discount) - (vendor_vat_on_line if any)
commission = 0.20 * product_net_ex_vat
vendor_net_payable = product_net_ex_vat - commission
  + shipping_to_vendor (if policy says vendor keeps shipping — default: track shipping separate; confirm allocation in code comments)
  - adjustments (refunds/chargebacks allocated to vendor)
```

Default shipping: **not** part of commission base; record shipping as its own field. Do not invent vendor shipping share without Client sign-off — store raw shipping and flag `shipping_allocation = "unassigned" | "platform" | "vendor"`.

---

## 4. Suggested stack (flexible)

Pick a simple, maintainable stack. Example:

- **App:** Node (Next.js) or Python (FastAPI) + small React/admin UI  
- **DB:** Postgres  
- **Jobs:** cron or queue for month close / Transfer retry  
- **Email:** transactional provider (Resend, Postmark, SES) → `admin@nirvanearth.com`  
- **Stripe:** official SDK, **test keys only** until go-live email  
- **Shopify:** Admin API (collaborator access) — read Orders, Products  
- **Webkul:** read seller mapping via app/API or admin-exported identifiers linked on line items / tags / metafields — **discover actual field names in Days 1–2**

Host: lightweight (Railway / Render / Fly / Vercel + DB). Production host must be **Client-owned** at handover.

---

## 5. Data model (minimum)

```text
Vendor
  id, name, email, vat_registered (bool), trade_licence_ref,
  stripe_connected_account_id, active, created_at

OrderSnapshot
  shopify_order_id, order_number, currency, paid_at,
  financial_status, fulfillment_status, raw_json

OrderLine
  id, shopify_order_id, shopify_line_id,
  vendor_id nullable, is_platform_own_product bool,
  title, quantity,
  gross, discount, product_net, vendor_vat, shipping_amount,
  commission_base, commission_amount, vendor_net,
  fulfilled_at, return_window_ends_at,
  status (open | blocked | qualified | included_in_pack)

Adjustment
  id, order_line_id or shopify_order_id,
  type (refund | chargeback | dispute | other),
  amount, status (open | resolved), resolved_at

MonthPack
  id, year_month (YYYY-MM), status (draft | pending_approval | approved | executing | closed)

SettlementLine
  id, month_pack_id, vendor_id,
  commission_base_sum, commission_sum, vendor_net_sum,
  fee_notes, status (blocked | qualified | approved | transferred | failed),
  stripe_transfer_id nullable

Approval
  id, entity_type, entity_id, actor_email, decision, created_at

AuditEvent
  id, action, actor_email, payload_json, created_at

TransferAttempt
  id, settlement_line_id, idempotency_key, amount,
  stripe_transfer_id, status, error, created_at
```

Use **idempotency_key** = `settlement_line_id + ":" + attempt` or stable `transfer:{settlement_line_id}` so retries do not double-pay.

---

## 6. Stripe (test mode)

### Keys

- Use **test** publishable + secret **or** restricted test key.  
- Scopes needed: Balance read; Charges/PaymentIntents/Refunds/Events read; Accounts write; Transfers write.  
- **Never** commit keys. Env only: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`.

### Flows

1. **Create Custom connected account** (test) for dummy vendors — UAE country, request `transfers` capability.  
2. **Transfer** after approval:

```text
POST /v1/transfers
  amount: integer minor units (fils for AED)
  currency: aed
  destination: connected_account_id
  transfer_group or metadata: month, settlement_line_id, shopify_order_ids
  idempotency key: required
```

3. Prefer linking to charges via `source_transaction` when a single charge maps cleanly; for mixed-vendor carts, metadata + transfer_group is acceptable if source_transaction cannot split — document what you implement.  
4. Platform liability: refunds/chargebacks hit **platform** balance under SCT.  
5. Do **not** change live `payouts_schedule`. Read-only confirm in test.

### Dummy vendors

Create 2+ test connected accounts: one VAT-like, one non-VAT. No real trade licence required in test.

---

## 7. Shopify / Webkul integration

### Shopify Admin API

- Read orders: line items, discounts, shipping, refunds, payment gateway label if present.  
- Read products: identify **own products / gift hampers** (Client may use product type, tag, vendor name, or specific product IDs — **confirm in Days 1–2** and put IDs/tags in config).  

### Webkul

- From Shopify Apps → Multi Vendor admin: sellers, commissions, seller payments.  
- Map `OrderLine` → Webkul seller id. If API is limited, use order line properties / vendor field Webkul injects.  
- **Do not** depend on seller panel login for the settlement engine.

### Return window

Config: `RETURN_WINDOW_DAYS` (default **14** unless Client specifies).  
`return_window_ends_at = fulfilled_at + RETURN_WINDOW_DAYS`.  
Line cannot be `qualified` until `now > return_window_ends_at` and no open adjustments.

---

## 8. Approval & email

- Settlement actions that move money or freeze a pack require approval by an email in `APPROVER_EMAILS` (default `admin@nirvanearth.com`).  
- States: `pending_approval` → `approved` → `executing` → `transferred` | `failed`.  
- On **initiate** (pack submitted), **approve**, and **execute** (Transfer attempted): send email to `admin@nirvanearth.com` with action, status, vendor, amount, actor.  
- Persist `AuditEvent` for every state change.

---

## 9. Test matrix (must pass before handover)

| # | Scenario | Expect |
|---|----------|--------|
| 1 | Single-vendor order | One settlement line; 20% after discount; shipping separate |
| 2 | Mixed-vendor cart | Per-vendor lines; multiple Transfers allowed |
| 3 | Own product / gift hamper | No vendor settlement line |
| 4 | VAT vendor | VAT separate; not in commission base |
| 5 | Non-VAT vendor | No vendor VAT |
| 6 | Discount | Commission on post-discount product value |
| 7 | Refund before qualify | Blocked / adjusted; no Transfer |
| 8 | Open chargeback | Not qualified |
| 9 | Approve → Transfer success | Email + audit + transfer id |
| 10 | Transfer fail | Status failed; safe retry |
| 11 | Duplicate execute | Idempotent; no second Transfer |
| 12 | Unqualified at month cut-off | Rolls to later month |

Record results in `docs/TEST_RESULTS.md`.

---

## 10. Day plan (10 working days)

| Days | Focus |
|------|--------|
| 1–2 | Access validation; discover Webkul seller fields; product ownership rules; Stripe test accounts; schema migrations |
| 3–6 | Ingest, rules engine, month pack, UI approval, emails, Transfer + idempotency |
| 7–8 | Full test matrix + fixes |
| 9–10 | Docs, env sample, handover notes, Client test acceptance |

---

## 11. Live mode (blocked until written go-live)

Only after email from `admin@nirvanearth.com` approving production deploy and live Transfers:

1. Client completes Stripe **Connect platform profile**.  
2. Client approves **production host** (owner = Nirvan Earth, cost disclosed).  
3. Switch app to **live** restricted key (same scopes).  
4. Onboard real vendors as UAE Custom accounts (trade licence).  
5. First live month: same qualification + 10th Transfer cycle.  
6. **Never** change gateway or payout settings without new written approval.

---

## 12. Env template

```bash
NODE_ENV=development
DATABASE_URL=postgres://...

SHOPIFY_SHOP=t91jg6-qq.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=

STRIPE_SECRET_KEY=sk_test_...          # test only until go-live
STRIPE_PUBLISHABLE_KEY=pk_test_...

APPROVER_EMAILS=admin@nirvanearth.com
NOTIFY_EMAIL=admin@nirvanearth.com
EMAIL_FROM=settlement@...

RETURN_WINDOW_DAYS=14
COMMISSION_RATE=0.20
PLATFORM_OWN_PRODUCT_TAGS=nirvan-own,gift-hamper   # adjust after discovery

APP_BASE_URL=https://...
```

---

## 13. Repo layout (suggested)

```text
/apps/web          # admin UI
/apps/api          # API + workers
/packages/shared   # types, rule engine pure functions
/docs
  CALCULATION_RULES.md    # copy of locked rules
  TEST_RESULTS.md
  HANDOVER.md             # hosting owner, cost, runbook
  OPERATING.md            # how Client runs monthly cycle
.env.example
README.md
```

**Rule engine** must be pure functions with unit tests (commission, VAT exclusion, own-product skip, qualification).

---

## 14. Hard “do not” list

1. Do not use `sk_live_` until go-live email.  
2. Do not call live Transfers in test.  
3. Do not modify Stripe payout schedule or Shopify payment settings.  
4. Do not treat platform own products as vendor sales.  
5. Do not put VAT in the 20% base.  
6. Do not Transfer unqualified or unapproved lines.  
7. Do not send secrets in git or chat — env / secret manager only.  

---

## 15. Handover checklist

- [ ] Test matrix green  
- [ ] `docs/OPERATING.md` — monthly steps for Client  
- [ ] `docs/HANDOVER.md` — host URL, owner, estimated monthly cost, admin users  
- [ ] Audit + email verified  
- [ ] Erms access reduced when Client requests  
- [ ] Client written acceptance of test mode  
- [ ] Live only after separate written approval  

---

## 16. Quick reference

| Item | Value |
|------|--------|
| Platform Stripe | `acct_1TxOZVK0wm8bsReE` |
| Shop | `t91jg6-qq.myshopify.com` |
| Approver | admin@nirvanearth.com |
| Fee | INR 50,000 (project) |
| Support | 6 months in-scope defects after production deploy |
| Support contact | contact@ermsintelligence.com |

---

*End of guide. Prefer this file over chat history when implementing.*
