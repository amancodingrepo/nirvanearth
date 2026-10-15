export interface OwnProductConfig {
  tags: string[];
  vendorNames: string[];
  productIds: string[];
}

export interface OwnProductInput {
  tags?: string[] | string | null;
  vendorName?: string | null;
  productId?: string | number | null;
}

function asTags(tags: OwnProductInput["tags"]): string[] {
  if (!tags) return [];
  const list = Array.isArray(tags) ? tags : tags.split(",");
  return list.map((tag) => tag.trim().toLowerCase()).filter(Boolean);
}

export function isPlatformOwn(
  product: { tags?: OwnProductInput["tags"]; id?: string | number | null },
  line: { vendor?: string | null },
  config: OwnProductConfig,
): boolean {
  return isPlatformOwnProduct(
    { tags: product.tags, productId: product.id, vendorName: line.vendor },
    config,
  );
}

export function isPlatformOwnProduct(input: OwnProductInput, config: OwnProductConfig): boolean {
  const tags = new Set(asTags(input.tags));
  for (const tag of config.tags) {
    if (tags.has(tag.trim().toLowerCase())) return true;
  }

  const vendor = (input.vendorName ?? "").trim().toLowerCase();
  if (vendor && config.vendorNames.some((name) => name.trim().toLowerCase() === vendor)) {
    return true;
  }

  if (input.productId == null || input.productId === "") return false;
  const raw = String(input.productId);
  const gid = raw.startsWith("gid://") ? raw : `gid://shopify/Product/${raw}`;
  return config.productIds.some((id) => id === raw || id === gid || id.endsWith(`/${raw}`));
}

export interface SellerSignal {
  externalKey: string | null;
  vendorName: string | null;
}

/**
 * Webkul's exact line field is confirmed in the shop during Days 1–2.
 * Until then this accepts the shapes Webkul and Shopify commonly write:
 * line properties (seller id), a `vendorKey::sku` SKU, or the line vendor name.
 */
const SELLER_PROPERTY_NAMES = new Set([
  "seller_id",
  "seller",
  "seller id",
  "vendor_id",
  "vendor id",
  "webkul_seller",
  "webkul_seller_id",
  "_seller",
  "_seller_id",
]);

export function parseSellerSignal(line: {
  properties?: Array<{ name?: string | null; value?: string | number | null }> | null;
  vendor?: string | null;
  sku?: string | null;
}): SellerSignal {
  const properties = Array.isArray(line.properties) ? line.properties : [];
  for (const property of properties) {
    const name = String(property.name ?? "").trim().toLowerCase();
    const value = property.value == null ? "" : String(property.value).trim();
    if (SELLER_PROPERTY_NAMES.has(name) && value) {
      return {
        externalKey: value,
        vendorName: line.vendor?.trim() || value,
      };
    }
  }

  const sku = line.sku?.trim() ?? "";
  if (sku.includes("::")) {
    const key = sku.split("::")[0]?.trim() ?? "";
    if (key) {
      return { externalKey: key, vendorName: line.vendor?.trim() || key };
    }
  }

  const vendorName = line.vendor?.trim() || null;
  return { externalKey: null, vendorName };
}

/** Webkul seller on a line. Null when the line carries no seller id and no vendor name. */
export function resolveSeller(
  line: {
    properties?: Array<{ name?: string | null; value?: string | number | null }> | null;
    vendor?: string | null;
    sku?: string | null;
  },
  _product?: unknown,
): { webkulSellerId: string | null; sellerName: string | null } | null {
  const signal = parseSellerSignal(line);
  if (!signal.externalKey && !signal.vendorName) return null;
  return { webkulSellerId: signal.externalKey, sellerName: signal.vendorName };
}
