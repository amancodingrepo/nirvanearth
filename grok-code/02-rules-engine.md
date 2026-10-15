# 02 — Rules engine

## Goal

Pure functions only. No DB, no Stripe, no Shopify. Full unit test coverage.

## Locked rules

- Commission = **20%** of product selling value **after discounts**, **excluding vendor VAT**
- Shipping: **not** in commission base
- Own products / gift hampers: **no** vendor commission line
- Qualified only after fulfilment + return window + no open adjustments

## Functions to implement

```text
computeLineMoney({
  gross, discount, vendorVat, shippingAmount, isPlatformOwn, commissionRate = 0.20
}) → {
  productNet,      // after discount, before commission
  commissionBase,  // productNet - vendorVat (if VAT separate)
  commissionAmount,
  vendorNet,       // commissionBase - commissionAmount
  shippingAmount,  // pass-through
  skipVendorSettlement: boolean  // true if isPlatformOwn
}

isQualified({
  isPlatformOwn, vendorId, fulfilledAt, returnWindowEndsAt, now, hasOpenAdjustment
}) → boolean

returnWindowEndsAt(fulfilledAt, returnWindowDays = 14) → Date
```

## Money

- Work in major currency units (AED) with 2 decimal places in app logic.
- Round commission with banker’s or half-up consistently; document choice; use same in tests.
- Stripe conversion later: `Math.round(vendorNet * 100)` fils.

## Unit tests (required)

| Name | Input | Expect |
|------|--------|--------|
| basic | gross 100, discount 0, vat 0 | base 100, commission 20, net 80 |
| discount | gross 100, discount 10 | base 90, commission 18, net 72 |
| vat_excluded | product net 100, vat 5 | base 100, commission 20 (vat not in base) |
| own_product | isPlatformOwn true | skipVendorSettlement true |
| shipping | shipping 15 | not added to base |
| not_fulfilled | fulfilledAt null | not qualified |
| in_return_window | now < returnWindowEndsAt | not qualified |
| open_refund | hasOpenAdjustment true | not qualified |
| qualified | all clear | true |

## Agent tasks

1. Create `packages/rules` with the functions above.  
2. Add test runner; all tests green.  
3. Export types for API use.

## Done when

`npm test` / `pytest` passes all cases above with zero network calls.
