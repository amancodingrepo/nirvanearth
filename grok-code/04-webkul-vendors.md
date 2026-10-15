# 04 — Webkul vendors + own products

## Goal

Resolve `vendor_id` on each `order_line` and set `is_platform_own`.

## Discovery (human + agent)

Inspect a multi-vendor order in Shopify admin / Webkul app and document:

- Line `vendor` field?  
- Line item properties / attributes from Webkul?  
- Metafield?  
- SKU pattern?

Implement **one** function:

```text
resolveSeller(line, product) → { webkulSellerId, sellerName } | null
isPlatformOwn(product, line) → boolean
```

Config examples:

```bash
PLATFORM_OWN_TAGS=nirvan-own,gift-hamper
PLATFORM_OWN_VENDOR_NAMES=Nirvan Earth
PLATFORM_OWN_PRODUCT_IDS=1234567890
```

## Logic

```text
if isPlatformOwn:
  order_line.is_platform_own = true
  order_line.vendor_id = null
else:
  find or create vendor by webkul_seller_id
  order_line.vendor_id = vendor.id
  order_line.is_platform_own = false
```

Then run rules engine on the line to fill `commission_base`, `commission_amount`, `vendor_net`.

## VAT flag

`vendors.vat_registered` default `false`. Admin UI or seed can set true later for test VAT vendor.

## Agent tasks

1. Implement resolveSeller based on documented field path (placeholder + config if unknown).  
2. Job: `enrich-lines` after sync.  
3. Create vendor rows idempotently on `webkul_seller_id`.

## Done when

- Own-product line → `is_platform_own=true`, no vendor  
- Third-party line → `vendor_id` set  
- Commission fields filled via rules engine
