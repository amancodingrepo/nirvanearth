# 05 — Stripe Connect (test mode)

## Goal

Test Custom connected accounts + Transfers after approval. **Test keys only.**

## Env

```bash
STRIPE_SECRET_KEY=sk_test_...   # must start with sk_test_ or be restricted test key
```

Assert in non-prod boot: key includes `test` or reject startup.

## Create test Custom account

```text
stripe.accounts.create({
  type: 'custom',
  country: 'AE',
  capabilities: { transfers: { requested: true } },
  business_type: 'company',
  // add tos_acceptance / business_profile as required in test
})
```

Save `id` → `vendors.stripe_account_id`.

## Transfer (only for approved settlement lines)

```text
stripe.transfers.create({
  amount: Math.round(vendorNetSum * 100), // fils
  currency: 'aed',
  destination: vendor.stripe_account_id,
  metadata: {
    settlement_line_id: '...',
    year_month: '2026-10',
  },
}, {
  idempotencyKey: `transfer:${settlementLineId}`,
})
```

Record in `transfer_attempts`. On success set `settlement_lines.stripe_transfer_id` and status `transferred`. On failure status `failed`.

## Idempotency

Same `idempotencyKey` twice → one Transfer only.

## Do not

- Change platform payout schedule  
- Use live key  
- Transfer without `settlement_lines.status === 'approved'`

## Agent tasks

1. Stripe client wrapper.  
2. `createTestConnectedAccount(vendorId)`.  
3. `executeTransfer(settlementLineId)`.  
4. Smoke script: account create + tiny transfer in test.

## Done when

Two dummy vendors have `acct_` ids; one approved line can Transfer in test; double execute does not double-pay.
