import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addDays,
  calculateCommission,
  computeLineMoney,
  dubaiYearMonth,
  exampleGiftHamper,
  exampleNonVatVendor,
  exampleVatVendor,
  exampleVatVendorDeliveryPaid,
  isPlatformOwn,
  isPlatformOwnProduct,
  isQualified,
  mixedVendorOrder,
  parseDeliveryAllowance,
  parseSellerSignal,
  qualifyLine,
  resolveSeller,
  returnWindowEndsAt,
  roundMoney,
  sellingAfterDiscount,
  toFils,
} from "../src/index.ts";

const ownConfig = {
  tags: ["nirvan-own", "gift-hamper"],
  vendorNames: ["Nirvan Earth"],
  productIds: ["gid://shopify/Product/123"],
};

describe("commission", () => {
  it("takes 20% of 100 with no VAT", () => {
    const result = calculateCommission({ gross: 100, discount: 0, vendorVat: 0 });
    assert.equal(result.commissionBase, 100);
    assert.equal(result.commissionAmount, 20);
    assert.equal(result.vendorNet, 80);
    assert.equal(result.skipped, false);
  });

  it("applies the discount before the 20%", () => {
    const after = sellingAfterDiscount(100, 10);
    assert.equal(after, 90);
    const result = calculateCommission({ gross: 100, discount: 10, vendorVat: 0 });
    assert.equal(result.commissionBase, 90);
    assert.equal(result.commissionAmount, 18);
    assert.equal(result.vendorNet, 72);
  });

  it("keeps VAT out of the base when the price includes it", () => {
    const result = calculateCommission({
      gross: 105,
      discount: 0,
      vendorVat: 5,
      taxesIncluded: true,
    });
    assert.equal(result.productNetExVat, 100);
    assert.equal(result.commissionBase, 100);
    assert.equal(result.commissionAmount, 20);
    assert.equal(result.vendorVat, 5);
    assert.equal(result.vendorNet, 85);
  });

  it("shows exclusive VAT separately and does not subtract it twice", () => {
    const result = calculateCommission({
      gross: 100,
      discount: 0,
      vendorVat: 5,
      taxesIncluded: false,
    });
    assert.equal(result.commissionBase, 100);
    assert.equal(result.commissionAmount, 20);
    assert.equal(result.vendorVat, 5);
    assert.equal(result.vendorNet, 85);
  });

  it("skips platform own products", () => {
    const result = calculateCommission({
      gross: 100,
      discount: 0,
      vendorVat: 5,
      isPlatformOwn: true,
    });
    assert.equal(result.skipped, true);
    assert.equal(result.commissionAmount, 0);
    assert.equal(result.vendorNet, 0);
    assert.equal(result.vendorVat, 0);
  });

  it("stores shipping beside the base and does not pay it", () => {
    const result = calculateCommission({
      gross: 100,
      discount: 0,
      vendorVat: 0,
      shippingAmount: 15,
    });
    assert.equal(result.shippingAmount, 15);
    assert.equal(result.shippingAllocation, "unassigned");
    assert.equal(result.commissionBase, 100);
    assert.equal(result.vendorNet, 80);
  });

  it("rounds to fils", () => {
    assert.equal(toFils(80), 8000);
    assert.equal(roundMoney(10.005), 10.01);
  });

  it("subtracts a resolved adjustment from vendor net", () => {
    const result = calculateCommission({
      gross: 100,
      discount: 0,
      vendorVat: 0,
      resolvedAdjustment: 8,
    });
    assert.equal(result.vendorNet, 72);
  });
});

describe("qualification", () => {
  const fulfilled = new Date("2026-09-01T08:00:00.000Z");
  const ends = addDays(fulfilled, 14);

  it("qualifies after the return window with no open adjustment", () => {
    const result = qualifyLine({
      isPlatformOwn: false,
      vendorId: "v1",
      fulfilledAt: fulfilled,
      returnWindowEndsAt: ends,
      hasOpenAdjustment: false,
      now: new Date(ends.getTime() + 1000),
    });
    assert.equal(result.qualified, true);
    assert.equal(result.status, "qualified");
  });

  it("blocks an open refund", () => {
    const result = qualifyLine({
      isPlatformOwn: false,
      vendorId: "v1",
      fulfilledAt: fulfilled,
      returnWindowEndsAt: ends,
      hasOpenAdjustment: true,
      now: new Date("2026-10-01T00:00:00.000Z"),
    });
    assert.equal(result.qualified, false);
    assert.equal(result.reason, "open_adjustment");
  });

  it("does not qualify on the exact window end", () => {
    const result = qualifyLine({
      isPlatformOwn: false,
      vendorId: "v1",
      fulfilledAt: fulfilled,
      returnWindowEndsAt: ends,
      hasOpenAdjustment: false,
      now: ends,
    });
    assert.equal(result.qualified, false);
    assert.equal(result.reason, "return_window");
  });

  it("blocks own products even when fulfilled", () => {
    const result = qualifyLine({
      isPlatformOwn: true,
      vendorId: null,
      fulfilledAt: fulfilled,
      returnWindowEndsAt: ends,
      hasOpenAdjustment: false,
      now: new Date("2026-10-01T00:00:00.000Z"),
    });
    assert.equal(result.reason, "platform_own");
  });
});

describe("own products and seller signals", () => {
  it("matches tags, vendor name, and product id", () => {
    assert.equal(isPlatformOwnProduct({ tags: ["Gift-Hamper"] }, ownConfig), true);
    assert.equal(isPlatformOwnProduct({ vendorName: "nirvan earth" }, ownConfig), true);
    assert.equal(isPlatformOwnProduct({ productId: 123 }, ownConfig), true);
    assert.equal(isPlatformOwnProduct({ tags: ["honey"], vendorName: "Gulf Honey Co" }, ownConfig), false);
  });

  it("reads a Webkul seller property before the vendor field", () => {
    const signal = parseSellerSignal({
      vendor: "Ignored",
      properties: [{ name: "webkul_seller_id", value: "seller-9" }],
    });
    assert.equal(signal.externalKey, "seller-9");
  });

  it("reads a sku prefix and falls back to vendor name", () => {
    assert.equal(parseSellerSignal({ sku: "honey::SKU-1", vendor: "Gulf Honey Co" }).externalKey, "honey");
    assert.deepEqual(parseSellerSignal({ vendor: "Desert Botanics" }), {
      externalKey: null,
      vendorName: "Desert Botanics",
    });
  });
});

describe("spec line money", () => {
  it("basic", () => {
    const result = computeLineMoney({ gross: 100, discount: 0, vendorVat: 0 });
    assert.equal(result.commissionBase, 100);
    assert.equal(result.commissionAmount, 20);
    assert.equal(result.vendorNet, 80);
    assert.equal(result.skipVendorSettlement, false);
  });

  it("discount", () => {
    const result = computeLineMoney({ gross: 100, discount: 10, vendorVat: 0 });
    assert.equal(result.productNet, 90);
    assert.equal(result.commissionBase, 90);
    assert.equal(result.commissionAmount, 18);
    assert.equal(result.vendorNet, 72);
  });

  it("vat_excluded", () => {
    const result = computeLineMoney({ gross: 100, discount: 0, vendorVat: 5 });
    assert.equal(result.productNet, 100);
    assert.equal(result.commissionBase, 100);
    assert.equal(result.commissionAmount, 20);
    assert.equal(result.vendorVat, 5);
    assert.equal(result.vendorNet, 85);
  });

  it("own_product", () => {
    const result = computeLineMoney({ gross: 100, discount: 0, vendorVat: 0, isPlatformOwn: true });
    assert.equal(result.skipVendorSettlement, true);
    assert.equal(result.commissionAmount, 0);
    assert.equal(result.vendorNet, 0);
  });

  it("shipping", () => {
    const result = computeLineMoney({ gross: 100, discount: 0, vendorVat: 0, shippingAmount: 15 });
    assert.equal(result.shippingAmount, 15);
    assert.equal(result.commissionBase, 100);
    assert.equal(result.vendorNet, 80);
  });
});

describe("spec qualification", () => {
  const fulfilled = new Date("2026-09-01T08:00:00.000Z");
  const ends = returnWindowEndsAt(fulfilled, 14);

  it("not_fulfilled", () => {
    assert.equal(
      isQualified({
        isPlatformOwn: false,
        vendorId: "v1",
        fulfilledAt: null,
        returnWindowEndsAt: null,
        hasOpenAdjustment: false,
        now: new Date("2026-10-01T00:00:00.000Z"),
      }),
      false,
    );
  });

  it("in_return_window", () => {
    assert.equal(
      isQualified({
        isPlatformOwn: false,
        vendorId: "v1",
        fulfilledAt: fulfilled,
        returnWindowEndsAt: ends,
        hasOpenAdjustment: false,
        now: new Date(ends.getTime() - 1000),
      }),
      false,
    );
  });

  it("open_refund", () => {
    assert.equal(
      isQualified({
        isPlatformOwn: false,
        vendorId: "v1",
        fulfilledAt: fulfilled,
        returnWindowEndsAt: ends,
        hasOpenAdjustment: true,
        now: new Date(ends.getTime() + 1000),
      }),
      false,
    );
  });

  it("qualified", () => {
    assert.equal(
      isQualified({
        isPlatformOwn: false,
        vendorId: "v1",
        fulfilledAt: fulfilled,
        returnWindowEndsAt: ends,
        hasOpenAdjustment: false,
        now: new Date(ends.getTime() + 1000),
      }),
      true,
    );
  });
});

describe("spec sellers", () => {
  it("resolveSeller reads webkul_seller_id", () => {
    assert.deepEqual(
      resolveSeller({ properties: [{ name: "webkul_seller_id", value: "seller-9" }], vendor: "Gulf Honey Co" }),
      { webkulSellerId: "seller-9", sellerName: "Gulf Honey Co" },
    );
    assert.equal(resolveSeller({}), null);
  });

  it("isPlatformOwn matches the configured tag", () => {
    assert.equal(isPlatformOwn({ tags: ["gift-hamper"], id: 1 }, { vendor: "Other" }, ownConfig), true);
    assert.equal(isPlatformOwn({ tags: ["honey"], id: 2 }, { vendor: "Gulf Honey Co" }, ownConfig), false);
  });
});

describe("28 Oct 2026 worked examples", () => {
  it("VAT vendor: commission on ex-VAT product after the included delivery allowance", () => {
    const result = exampleVatVendor.result;
    assert.equal(result.productSellingAfterDiscount, 126);
    assert.equal(result.productNetExVat, 120);
    assert.equal(result.deliveryAllowance, 20);
    assert.equal(result.commissionBase, 100);
    assert.equal(result.commissionAmount, 20);
    assert.equal(result.vendorVat, 6);
    assert.equal(result.deliveryAllocation, "unassigned");
    assert.equal(result.vendorNet, 86);
  });

  it("pays the included delivery allowance only when it belongs to the vendor", () => {
    assert.equal(exampleVatVendorDeliveryPaid.result.commissionBase, 100);
    assert.equal(exampleVatVendorDeliveryPaid.result.commissionAmount, 20);
    assert.equal(exampleVatVendorDeliveryPaid.result.vendorNet, 106);
  });

  it("non-VAT vendor: no VAT line, delivery allowance out of the base", () => {
    const result = exampleNonVatVendor.result;
    assert.equal(result.vendorVat, 0);
    assert.equal(result.productSellingAfterDiscount, 150);
    assert.equal(result.commissionBase, 120);
    assert.equal(result.commissionAmount, 24);
    assert.equal(result.vendorNet, 96);
  });

  it("excludes a platform gift hamper from vendor settlement", () => {
    assert.equal(exampleGiftHamper.result.skipped, true);
    assert.equal(exampleGiftHamper.result.commissionAmount, 0);
    assert.equal(exampleGiftHamper.result.vendorNet, 0);
    assert.equal(exampleGiftHamper.result.vendorVat, 0);
  });

  it("mixed-vendor order settles only the two third-party lines", () => {
    const order = mixedVendorOrder();
    assert.equal(order.lines.length, 3);
    assert.equal(order.customerProductTotal, 456);
    assert.equal(order.separateShipping, 15);
    assert.equal(order.commissionTotal, 44);
    assert.equal(order.vendorEntitlementTotal, 182);
    assert.equal(order.lines[2]!.result.skipped, true);
  });

  it("reads an included delivery allowance from line properties", () => {
    assert.deepEqual(
      parseDeliveryAllowance({
        properties: [
          { name: "delivery_allowance", value: "20" },
          { name: "delivery_allocation", value: "vendor" },
        ],
      }),
      { amount: 20, allocation: "vendor", source: "property" },
    );
    assert.deepEqual(parseDeliveryAllowance({}), {
      amount: 0,
      allocation: "unassigned",
      source: "default",
    });
  });
});

describe("cancel and unpaid qualification", () => {
  const fulfilled = new Date("2026-09-01T08:00:00.000Z");
  const ends = addDays(fulfilled, 14);
  const now = new Date(ends.getTime() + 1000);
  const base = {
    isPlatformOwn: false,
    vendorId: "v1",
    fulfilledAt: fulfilled,
    returnWindowEndsAt: ends,
    hasOpenAdjustment: false,
    now,
  };

  it("blocks a cancelled order", () => {
    assert.equal(qualifyLine({ ...base, cancelled: true }).reason, "cancelled");
  });

  it("blocks a fully refunded order", () => {
    assert.equal(qualifyLine({ ...base, financialStatus: "refunded" }).reason, "refunded");
  });

  it("blocks an unpaid order", () => {
    assert.equal(qualifyLine({ ...base, financialStatus: "pending" }).reason, "unpaid");
  });

  it("still qualifies a paid order", () => {
    assert.equal(qualifyLine({ ...base, financialStatus: "paid" }).qualified, true);
  });
});

describe("rule flags", () => {
  it("can leave vendor VAT out of the net", () => {
    const result = calculateCommission({
      gross: 105,
      discount: 0,
      vendorVat: 5,
      taxesIncluded: true,
      includeVendorVatInNet: false,
    });
    assert.equal(result.commissionBase, 100);
    assert.equal(result.commissionAmount, 20);
    assert.equal(result.vendorVat, 5);
    assert.equal(result.vendorNet, 80);
  });

  it("can keep an included delivery allowance inside the commission base", () => {
    const result = calculateCommission({
      gross: 100,
      discount: 0,
      deliveryAllowance: 20,
      excludeDeliveryAllowanceFromCommissionBase: false,
    });
    assert.equal(result.commissionBase, 100);
    assert.equal(result.commissionAmount, 20);
    assert.equal(result.vendorNet, 80);
  });
});

describe("Dubai month", () => {
  it("rolls the UTC evening of the 30th into the next Dubai month", () => {
    assert.equal(dubaiYearMonth(new Date("2026-09-30T22:00:00.000Z")), "2026-10");
    assert.equal(dubaiYearMonth(new Date("2026-10-01T00:00:00.000Z")), "2026-10");
  });
});
