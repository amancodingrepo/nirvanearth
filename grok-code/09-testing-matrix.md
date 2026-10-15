# 09 — Testing matrix + done criteria

## Goal

Prove test mode works end-to-end. Record results.

## System checks (before matrix)

| System | Check |
|--------|--------|
| Shopify | Paid order readable via API |
| Webkul | Seller resolved on at least one line |
| Stripe test | balance.retrieve OK; key is test |
| Rules | Unit tests green |
| Tool | health OK |

## Twelve scenarios

| # | Scenario | Setup | Pass |
|---|----------|--------|------|
| 1 | Single vendor | 1 vendor, 1 paid line | One settlement line; 20% after discount |
| 2 | Mixed cart | 2 vendors one order | 2 lines; 2 Transfers after approve |
| 3 | Own product | platform own flag/tag | No vendor settlement |
| 4 | VAT vendor | vat_registered + vat amount | VAT not in commission base |
| 5 | Non-VAT | vat_registered false | No vendor VAT |
| 6 | Discount | line discount | Base = after discount |
| 7 | Refund early | open refund adjustment | Blocked |
| 8 | Chargeback open | open chargeback | Not qualified |
| 9 | Success path | approve + execute | transfer id + email + audit |
| 10 | Transfer fail | bad destination | failed status; no crash |
| 11 | Double execute | execute twice | One Transfer only |
| 12 | Roll | still in return window | Not transferred |

Write `docs/TEST_RESULTS.md` with date, scenario, pass/fail, notes, transfer ids.

## Docs to produce

- `docs/OPERATING.md` — monthly Client steps  
- `docs/HANDOVER.md` — host, access, costs  
- `docs/CALCULATION_RULES.md` — locked rules copy  

## Live gate

Do not use live keys or live Transfers until email from `admin@nirvanearth.com` approving go-live.

## Done when

- All 12 pass (or waived in writing by Client)  
- Docs present  
- Client can approve a pack in the tool  
- No live key in env
