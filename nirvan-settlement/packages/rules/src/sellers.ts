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
 * Seller id is read from the Shopify line. There is no Webkul API.
 * Priority: configured or known line properties, then `sellerKey::sku`, then the line vendor name.
 * `extraPropertyNames` (WEBKUL_PROPERTY_NAMES or the active rule) are added to the built-in set.
 */
export const SELLER_PROPERTY_NAMES = [
  "seller_id",
  "seller",
  "seller id",
  "vendor_id",
  "vendor id",
  "webkul_seller",
  "webkul_seller_id",
  "_seller",
  "_seller_id",
] as const;

export function sellerPropertyNameSet(extra?: string[]): Set<string> {
  const names = new Set<string>(SELLER_PROPERTY_NAMES);
  for (const name of extra ?? []) {
    const normalized = name.trim().toLowerCase();
    if (normalized) names.add(normalized);
  }
  return names;
}

export function parseSellerSignal(
  line: {
    properties?: Array<{ name?: string | null; value?: string | number | null }> | null;
    vendor?: string | null;
    sku?: string | null;
  },
  options?: { propertyNames?: string[] },
): SellerSignal {
  const allowed = sellerPropertyNameSet(options?.propertyNames);
  const properties = Array.isArray(line.properties) ? line.properties : [];
  for (const property of properties) {
    const name = String(property.name ?? "").trim().toLowerCase();
    const value = property.value == null ? "" : String(property.value).trim();
    if (allowed.has(name) && value) {
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
  options?: { propertyNames?: string[] },
): { webkulSellerId: string | null; sellerName: string | null } | null {
  const signal = parseSellerSignal(line, options);
  if (!signal.externalKey && !signal.vendorName) return null;
  return { webkulSellerId: signal.externalKey, sellerName: signal.vendorName };
}
