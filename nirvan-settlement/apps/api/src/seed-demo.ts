import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "./config.ts";
import { ingestShopifyOrder } from "./ingest.ts";
import type { ShopifyOrder } from "./types.ts";

export async function runSeedDemo(db: PrismaClient, config: AppConfig) {
  for (const email of config.approverEmails) {
    await db.adminUser.upsert({ where: { email }, create: { email }, update: {} });
  }

  await db.vendor.upsert({
    where: { externalKey: "desert" },
    create: {
      name: "Desert Botanics",
      email: "vendor.desert@example.com",
      webkulSellerId: "desert",
      externalKey: "desert",
      vatRegistered: true,
      stripeAccountId: "acct_test_desert",
      tradeLicenceRef: "TL-TEST-DESERT",
    },
    update: { vatRegistered: true, stripeAccountId: "acct_test_desert", webkulSellerId: "desert" },
  });

  await db.vendor.upsert({
    where: { externalKey: "honey" },
    create: {
      name: "Gulf Honey Co",
      email: "vendor.honey@example.com",
      webkulSellerId: "honey",
      externalKey: "honey",
      vatRegistered: false,
      stripeAccountId: "acct_test_honey",
      tradeLicenceRef: "TL-TEST-HONEY",
    },
    update: { vatRegistered: false, stripeAccountId: "acct_test_honey", webkulSellerId: "honey" },
  });

  const orders: ShopifyOrder[] = [
    {
      id: 9001,
      name: "#9001",
      currency: "AED",
      financial_status: "paid",
      fulfillment_status: "fulfilled",
      gateway: "shopify_payments",
      processed_at: "2026-09-02T08:00:00.000Z",
      taxes_included: true,
      shipping_lines: [{ price: "15.00" }],
      fulfillments: [
        {
          created_at: "2026-09-02T12:00:00.000Z",
          line_items: [{ id: 1 }, { id: 2 }],
        },
      ],
      line_items: [
        {
          id: 1,
          title: "Desert rose oil 30ml",
          quantity: 1,
          price: "105.00",
          vendor: "Desert Botanics",
          product_id: 501,
          tax_lines: [{ price: "5.00", title: "VAT" }],
          properties: [{ name: "webkul_seller_id", value: "desert" }],
        },
        {
          id: 2,
          title: "Sidr honey 250g",
          quantity: 1,
          price: "80.00",
          total_discount: "0.00",
          vendor: "Gulf Honey Co",
          product_id: 502,
          properties: [{ name: "webkul_seller_id", value: "honey" }],
        },
      ],
    },
    {
      id: 9002,
      name: "#9002",
      currency: "AED",
      financial_status: "paid",
      fulfillment_status: "fulfilled",
      gateway: "shopify_payments",
      processed_at: "2026-09-06T08:00:00.000Z",
      taxes_included: false,
      fulfillments: [{ created_at: "2026-09-06T12:00:00.000Z", line_items: [{ id: 3 }] }],
      line_items: [
        {
          id: 3,
          title: "Nirvan Earth gift hamper",
          quantity: 1,
          price: "180.00",
          vendor: "Nirvan Earth",
          product_id: 900,
          product_tags: ["gift-hamper"],
        },
      ],
    },
    {
      id: 9003,
      name: "#9003",
      currency: "AED",
      financial_status: "paid",
      fulfillment_status: "fulfilled",
      gateway: "shopify_payments",
      processed_at: "2026-10-05T08:00:00.000Z",
      taxes_included: false,
      fulfillments: [{ created_at: "2026-10-05T12:00:00.000Z", line_items: [{ id: 4 }] }],
      line_items: [
        {
          id: 4,
          title: "Desert rose oil refill",
          quantity: 1,
          price: "60.00",
          vendor: "Desert Botanics",
          product_id: 501,
          properties: [{ name: "webkul_seller_id", value: "desert" }],
        },
      ],
    },
    {
      id: 9004,
      name: "#9004",
      currency: "AED",
      financial_status: "paid",
      fulfillment_status: "fulfilled",
      gateway: "shopify_payments",
      processed_at: "2026-09-08T08:00:00.000Z",
      taxes_included: true,
      shipping_lines: [{ price: "12.00" }],
      fulfillments: [{ created_at: "2026-09-08T12:00:00.000Z", line_items: [{ id: 5 }] }],
      line_items: [
        {
          id: 5,
          title: "Desert rose oil, delivery included",
          quantity: 1,
          price: "115.00",
          vendor: "Desert Botanics",
          product_id: 504,
          tax_lines: [{ price: "5.00", title: "VAT" }],
          properties: [
            { name: "webkul_seller_id", value: "desert" },
            { name: "included_delivery_allowance", value: "10" },
            { name: "delivery_allocation", value: "unassigned" },
          ],
        },
      ],
    },
  ];

  let ordersUpserted = 0;
  let linesUpserted = 0;
  for (const order of orders) {
    const result = await ingestShopifyOrder(db, config, order, "seed");
    ordersUpserted++;
    linesUpserted += result.lineCount;
  }

  return { ok: true, ordersUpserted, linesUpserted };
}
