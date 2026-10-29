import type { OwnProductConfig } from "@nirvan/rules";

export interface AppConfig {
  nodeEnv: string;
  databaseUrl: string;
  shopifyShop: string;
  shopifyApiKey: string;
  shopifyApiSecret: string;
  shopifyToken: string;
  shopifyScopes: string;
  stripeSecretKey: string;
  stripePublishableKey: string;
  approverEmails: string[];
  notifyEmail: string;
  emailFrom: string;
  resendApiKey: string;
  returnWindowDays: number;
  commissionRate: number;
  ownProducts: OwnProductConfig;
  appUrl: string;
  adminPassword: string;
  sessionSecret: string;
  allowLive: boolean;
  enablePayoutTrigger: boolean;
  stripeWebhookSecret: string;
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? "development";
  const rawStripeKey = env.STRIPE_SECRET_KEY ?? "";
  const stripeSecretKey = rawStripeKey.includes("paste_your_token") ? "" : rawStripeKey;
  const allowLive = env.ALLOW_LIVE === "true" || env.ALLOW_LIVE_TRANSFERS === "true";
  const liveKey = stripeSecretKey.startsWith("sk_live_") || stripeSecretKey.startsWith("rk_live_");

  if (liveKey && !allowLive) {
    throw new Error(
      "Refusing a live Stripe key until ALLOW_LIVE=true or ALLOW_LIVE_TRANSFERS=true after written go-live approval.",
    );
  }
  if (nodeEnv !== "production" && liveKey) {
    throw new Error("Refusing a live Stripe key outside production.");
  }
  if (stripeSecretKey && !liveKey && !stripeSecretKey.startsWith("sk_test_") && !stripeSecretKey.startsWith("rk_test_")) {
    throw new Error("STRIPE_SECRET_KEY must be a test key (sk_test_ or rk_test_) until go-live.");
  }

  const databaseUrl = env.DATABASE_URL ?? "";
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const tags = splitList(env.PLATFORM_OWN_TAGS ?? env.PLATFORM_OWN_PRODUCT_TAGS ?? "nirvan-own,gift-hamper");

  return {
    nodeEnv,
    databaseUrl,
    shopifyShop: env.SHOPIFY_SHOP ?? "t91jg6-qq.myshopify.com",
    shopifyApiKey: env.SHOPIFY_API_KEY ?? env.SHOPIFY_CLIENT_ID ?? "",
    shopifyApiSecret: env.SHOPIFY_API_SECRET ?? env.SHOPIFY_CLIENT_SECRET ?? "",
    shopifyToken: env.SHOPIFY_ADMIN_TOKEN ?? env.SHOPIFY_ADMIN_ACCESS_TOKEN ?? "",
    shopifyScopes:
      env.SCOPES ??
      env.SHOPIFY_SCOPES ??
      "read_orders,read_products,read_fulfillments,read_merchant_managed_fulfillment_orders",
    stripeSecretKey,
    stripePublishableKey: env.STRIPE_PUBLISHABLE_KEY ?? "",
    approverEmails: splitList(env.APPROVER_EMAILS ?? "admin@nirvanearth.com").map((email) => email.toLowerCase()),
    notifyEmail: (env.NOTIFY_EMAIL ?? "admin@nirvanearth.com").toLowerCase(),
    emailFrom: env.EMAIL_FROM ?? "settlement@localhost",
    resendApiKey: env.RESEND_API_KEY ?? "",
    returnWindowDays: Number(env.RETURN_WINDOW_DAYS ?? 14),
    commissionRate: Number(env.COMMISSION_RATE ?? 0.2),
    ownProducts: {
      tags,
      vendorNames: splitList(env.PLATFORM_OWN_VENDOR_NAMES ?? "Nirvan Earth"),
      productIds: splitList(env.PLATFORM_OWN_PRODUCT_IDS),
    },
    appUrl: env.APP_URL ?? env.APP_BASE_URL ?? "http://localhost:3000",
    adminPassword: env.ADMIN_PASSWORD ?? "change-me",
    sessionSecret: env.SESSION_SECRET ?? "dev-session-secret",
    allowLive,
    enablePayoutTrigger: env.ENABLE_PAYOUT_TRIGGER === "true",
    stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? "",
  };
}

export function assertApprover(config: AppConfig, email: string): void {
  if (!config.approverEmails.includes(email.toLowerCase())) {
    throw new HttpError(403, "Only admin@nirvanearth.com can approve or execute settlements.");
  }
}

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
