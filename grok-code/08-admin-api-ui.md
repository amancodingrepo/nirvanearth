# 08 — Admin API + minimal UI

## Goal

Thin API + screens so Client can see packs and approve.

## API routes (example)

```text
POST   /api/sync/orders
POST   /api/packs/generate          { yearMonth }
GET    /api/packs
GET    /api/packs/:id
POST   /api/packs/:id/submit
POST   /api/packs/:id/approve       { actorEmail }
POST   /api/packs/:id/execute       { actorEmail }
GET    /api/vendors
PATCH  /api/vendors/:id             { vat_registered, stripe_account_id }
GET    /api/audit
GET    /api/health
```

Protect mutations with simple shared secret or login. Approver email must match allowlist on approve/execute.

## UI screens

1. **Health** — DB + Stripe test ping  
2. **Orders** — recent lines, vendor, status  
3. **Packs** — list by month  
4. **Pack detail** — settlement lines, totals, buttons Submit / Approve / Execute  
5. **Vendors** — VAT flag, Stripe account id  
6. **Audit** — last 50 events  

No public storefront. Internal tool only.

## Agent tasks

1. Implement API wired to modules 03–07.  
2. Minimal UI (can be server-rendered).  
3. Disable Execute in production unless `ALLOW_LIVE_TRANSFERS=true` and key is live **and** go-live flag set (default false).

## Done when

From UI: generate → submit → approve → execute test Transfer for one dummy vendor line.
