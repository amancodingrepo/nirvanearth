# Nirvan Earth Settlement — Grok Code Pack

**Read this first.** Implement modules in order. Each file is self-contained for an agent session.

| Order | File | Build |
|------:|------|--------|
| 0 | `00-README.md` | Index + hard rules |
| 1 | `01-database.md` | Schema + migrations |
| 2 | `02-rules-engine.md` | Commission, VAT, qualification (unit tests) |
| 3 | `03-shopify-sync.md` | Pull paid orders into DB |
| 4 | `04-webkul-vendors.md` | Seller mapping + own products |
| 5 | `05-stripe-connect.md` | Test Custom accounts + Transfers |
| 6 | `06-month-packs.md` | Pack generation + settlement lines |
| 7 | `07-approval-email.md` | Approvals, audit, emails |
| 8 | `08-admin-api-ui.md` | API routes + minimal admin UI |
| 9 | `09-testing-matrix.md` | 12 scenarios + definition of done |

## Project constants

- Shop: `t91jg6-qq.myshopify.com`
- Stripe platform: `acct_1TxOZVK0wm8bsReE`
- Approver: `admin@nirvanearth.com`
- Currency: AED (Stripe amount = major × 100 fils)
- Commission: 20% after discount, **excluding** vendor VAT
- Mode: **TEST keys only** until Client go-live email

## Hard do-not

1. No `sk_live_` until written go-live from admin@nirvanearth.com  
2. No change to Shopify gateway or Stripe payout schedule  
3. No Transfer without approved settlement line  
4. Own products / gift hampers never get vendor settlement lines  
5. No secrets in git  

## Suggested stack

- API: Node (Fastify) or Python (FastAPI)
- DB: Postgres
- UI: Next.js or simple React admin
- Stripe + Shopify official SDKs

## Definition of done (test mode)

All modules 01–09 complete, 12 test scenarios recorded, OPERATING + HANDOVER docs written.
