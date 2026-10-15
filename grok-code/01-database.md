# 01 — Database

## Goal

Postgres schema for settlement. No business logic here.

## Tables

```sql
-- vendors
CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT,
  vat_registered BOOLEAN NOT NULL DEFAULT false,
  stripe_account_id TEXT,
  webkul_seller_id TEXT UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- order_snapshots
CREATE TABLE order_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id TEXT NOT NULL UNIQUE,
  order_number TEXT,
  currency TEXT NOT NULL DEFAULT 'AED',
  paid_at TIMESTAMPTZ,
  financial_status TEXT,
  fulfillment_status TEXT,
  raw_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- order_lines
CREATE TABLE order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id TEXT NOT NULL REFERENCES order_snapshots(shopify_order_id),
  shopify_line_id TEXT NOT NULL,
  vendor_id UUID REFERENCES vendors(id),
  is_platform_own BOOLEAN NOT NULL DEFAULT false,
  title TEXT,
  quantity INT NOT NULL DEFAULT 1,
  gross NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount NUMERIC(12,2) NOT NULL DEFAULT 0,
  product_net NUMERIC(12,2) NOT NULL DEFAULT 0,
  vendor_vat NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_base NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  vendor_net NUMERIC(12,2) NOT NULL DEFAULT 0,
  fulfilled_at TIMESTAMPTZ,
  return_window_ends_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open',
  -- open | blocked | qualified | packed
  UNIQUE (shopify_order_id, shopify_line_id)
);

CREATE TABLE adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_line_id UUID REFERENCES order_lines(id),
  shopify_order_id TEXT,
  type TEXT NOT NULL, -- refund | chargeback | dispute | other
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- open | resolved
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE month_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year_month TEXT NOT NULL UNIQUE, -- YYYY-MM
  status TEXT NOT NULL DEFAULT 'draft',
  -- draft | pending_approval | approved | executing | closed
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE settlement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_pack_id UUID NOT NULL REFERENCES month_packs(id),
  vendor_id UUID NOT NULL REFERENCES vendors(id),
  commission_base_sum NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_sum NUMERIC(12,2) NOT NULL DEFAULT 0,
  vendor_net_sum NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'qualified',
  -- blocked | qualified | approved | transferred | failed
  stripe_transfer_id TEXT,
  UNIQUE (month_pack_id, vendor_id)
);

CREATE TABLE approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  actor_email TEXT NOT NULL,
  decision TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  actor_email TEXT,
  payload_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transfer_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_line_id UUID NOT NULL REFERENCES settlement_lines(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  amount NUMERIC(12,2) NOT NULL,
  stripe_transfer_id TEXT,
  status TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

## Agent tasks

1. Add migration tool (Prisma / Drizzle / Alembic / raw SQL).  
2. Run migrate on empty Postgres.  
3. Seed nothing required except optional local admin mapping.  

## Done when

All tables exist; unique constraints work; can insert a vendor + order_snapshot manually.
