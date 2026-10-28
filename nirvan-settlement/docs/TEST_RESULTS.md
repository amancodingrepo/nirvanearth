# Test results

Run on 12 October 2026 with `npm test` against `nirvan_settlement_test`. Stripe calls use the simulated gateway because no test secret is configured. Rules: 27 passed, including the `grok-code/02` cases (`basic`, `discount`, `vat_excluded`, `own_product`, `shipping`, `not_fulfilled`, `in_return_window`, `open_refund`, `qualified`). Matrix: 14 passed.

| # | Scenario | Result |
|---|----------|--------|
| 1 | Single-vendor order | Pass. Base 100, commission 20, net 80. Shipping 15 stored as unassigned. |
| 2 | Mixed-vendor cart | Pass. Two settlement lines, two transfers. |
| 3 | Own product / gift hamper | Pass. No vendor and no settlement line. |
| 4 | VAT vendor | Inclusive 105 with VAT 5 → base 100, commission 20, entitlement 85 (VAT added back, rules 2026-10-28). |
| 5 | Non-VAT vendor | Pass. Tax line ignored. Vendor VAT 0. |
| 6 | Discount | Pass. 100 minus 10 → base 90, commission 18, net 72. |
| 7 | Refund before qualify | Pass. Blocked. No transfer. |
| 8 | Open chargeback | Pass. Not qualified. |
| 9 | Approve → transfer success | Pass. Transfer id stored. Email and audit written. |
| 10 | Transfer fail | Pass. Status failed. Pack stays executing. No crash. |
| 11 | Duplicate execute | Pass. One transfer attempt. |
| 12 | Unqualified at month cut-off | Pass. Held in October. Rolls into November after the window. |

HTTP login, generate, submit, approve, and execute also passed inside the same run.
