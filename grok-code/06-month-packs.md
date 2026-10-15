# 06 — Month packs

## Goal

Calendar-month vendor packs from qualified lines.

## Generate pack `YYYY-MM`

1. Ensure lines have commission fields and qualification status refreshed.  
2. Qualification:
   - not platform own  
   - vendor_id present  
   - fulfilled_at set  
   - now > return_window_ends_at  
   - no open adjustments on line/order  
3. Filter lines with `paid_at` in that calendar month (default).  
4. Group by `vendor_id`.  
5. Sum `commission_base`, `commission_amount`, `vendor_net`.  
6. Upsert `month_packs` + `settlement_lines`.  
7. Mark source lines `status = packed` where included.  
8. Pack status `draft`.

## Blocked lines

Lines that fail qualification stay out of payable totals; optionally list as blocked for visibility.

## Agent tasks

1. Service `generateMonthPack(yearMonth: string)`.  
2. CLI: `generate-pack 2026-10`.  
3. Idempotent re-generate while status is `draft` only (or replace draft lines).

## Done when

Running generate on a month with seeded qualified lines creates one pack and correct per-vendor sums.
