import { randomBytes } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { actorFromRequest, passwordsMatch, setSessionCookie } from "./auth.ts";
import type { AppConfig } from "./config.ts";
import { HttpError } from "./config.ts";
import { enrichLines, ingestShopifyOrder, qualifyAll, requalifyLines } from "./ingest.ts";
import { runSeedDemo } from "./seed-demo.ts";
import { createMailer, type Mailer } from "./mailer.ts";
import { approvePack, generateMonthPack, getPack, submitPack } from "./pack.ts";
import { executePack } from "./execute.ts";
import { ensureSettlementInvoice, invoicePdfForLine } from "./invoice.ts";
import { ownerReportCsv, ownerSalesReport } from "./owner-report.ts";
import { applyPayoutEvent, requestBankPayout } from "./payout.ts";
import { approveRule, createDraftRule, listRules, submitRule } from "./rules-store.ts";
import { presentLine, presentPack } from "./serialize.ts";
import {
  exchangeShopifyCode,
  fetchPaidOrders,
  getShopifyAccessToken,
  isValidShopifyDomain,
  verifyShopifyHmac,
} from "./shopify.ts";
import { RULES_VERSION } from "@nirvan/rules";
import { constructStripeEvent, createStripeGateway, pingStripe } from "./stripe.ts";
import type { TransferGateway } from "./types.ts";

function redactSecrets(message: string): string {
  return message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://***")
    .replace(/\b(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9]+\b/g, "[redacted-key]")
    .replace(/\bshp(?:at|ss|ca)_[A-Za-z0-9]+\b/g, "[redacted-token]");
}

export interface AppDeps {
  config: AppConfig;
  db: PrismaClient;
  gateway?: TransferGateway;
  mailer?: Mailer;
}

export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config, db } = deps;
  const gateway = deps.gateway ?? createStripeGateway(config);
  const mailer = deps.mailer ?? createMailer(config);
  const app = Fastify({ logger: false });
  await app.register(cookie);

  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    const raw = typeof body === "string" ? body : body.toString("utf8");
    (request as FastifyRequest & { rawBody?: string }).rawBody = raw;
    if (!raw.trim()) {
      done(null, {});
      return;
    }
    try {
      done(null, JSON.parse(raw));
    } catch (err) {
      const error = err as Error & { statusCode?: number };
      error.statusCode = 400;
      done(error, undefined);
    }
  });

  app.setErrorHandler((error, _request, reply) => {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected error";
    reply.status(status).send({ error: redactSecrets(message) });
  });

  app.get("/api/health", async () => {
    let dbOk = false;
    let dbError: string | undefined;
    try {
      await db.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (error) {
      dbError = redactSecrets(error instanceof Error ? error.message : "database unavailable");
    }

    let stripe: { ok: boolean; mode: string; availableAed: number | null; error?: string };
    try {
      const ping = await pingStripe(config);
      stripe = { ok: true, mode: ping.mode, availableAed: ping.availableAed };
    } catch (error) {
      stripe = {
        ok: false,
        mode: gateway.mode,
        availableAed: null,
        error: redactSecrets(error instanceof Error ? error.message : "stripe unavailable"),
      };
    }

    let shopifyConnected = false;
    try {
      const token = await getShopifyAccessToken(config, db);
      shopifyConnected = Boolean(token);
    } catch {
      shopifyConnected = false;
    }

    let webkulSellers: number | null = null;
    if (dbOk) {
      try {
        webkulSellers = await db.vendor.count({
          where: { OR: [{ webkulSellerId: { not: null } }, { externalKey: { not: null } }] },
        });
      } catch {
        webkulSellers = null;
      }
    }

    const testKeyPresent =
      config.stripeSecretKey.startsWith("sk_test_") || config.stripeSecretKey.startsWith("rk_test_");

    return {
      ok: dbOk && stripe.ok,
      rulesVersion: RULES_VERSION,
      db: { ok: dbOk, error: dbError },
      stripe: {
        ...stripe,
        testKeyPresent,
        liveTransfersBlocked: !config.allowLive,
      },
      shopify: {
        connected: shopifyConnected,
        shop: config.shopifyShop,
        mode: shopifyConnected ? "active" : "needs_auth",
        adminTokenPresent: Boolean(config.shopifyToken),
        authPath: shopifyConnected ? null : "/shopify/auth",
      },
      webkul: {
        apiConfigured: Boolean(process.env.WEBKUL_API_KEY || process.env.WEBKUL_ACCESS_TOKEN),
        sellersInLedger: webkulSellers,
      },
      mode: gateway.mode,
      shop: config.shopifyShop,
      liveBlocked: !config.allowLive,
      email: {
        provider: config.resendApiKey ? "resend" : "outbox",
        notifyEmail: config.notifyEmail,
        fromConfigured: Boolean(config.emailFrom) && !config.emailFrom.endsWith("@localhost"),
      },
    };
  });

  const handleShopifyAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query ?? {}) as { shop?: string };
    const shop = (query.shop ?? config.shopifyShop).toLowerCase().trim();
    if (!isValidShopifyDomain(shop)) {
      throw new HttpError(400, "Invalid shop domain. Must end with .myshopify.com");
    }
    if (!config.shopifyApiKey) {
      throw new HttpError(500, "SHOPIFY_API_KEY is not configured in environment variables.");
    }
    const state = randomBytes(16).toString("hex");
    reply.setCookie("shopify_oauth_state", state, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 600,
    });
    const redirectUri = `${config.appUrl.replace(/\/+$/, "")}/shopify/callback`;
    const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${encodeURIComponent(
      config.shopifyApiKey,
    )}&scope=${encodeURIComponent(config.shopifyScopes)}&redirect_uri=${encodeURIComponent(
      redirectUri,
    )}&state=${encodeURIComponent(state)}`;
    return reply.redirect(authUrl);
  };

  app.get("/shopify/auth", handleShopifyAuth);
  app.get("/api/shopify/auth", handleShopifyAuth);

  const handleShopifyCallback = async (request: FastifyRequest, reply: FastifyReply) => {
    const query = (request.query ?? {}) as Record<string, string | undefined>;
    const { code, shop, state, hmac } = query;
    if (!shop || !isValidShopifyDomain(shop)) {
      throw new HttpError(400, "Invalid or missing shop domain. Must end with .myshopify.com");
    }
    if (!code) {
      throw new HttpError(400, "Missing authorization code from Shopify.");
    }
    const expectedState = request.cookies?.shopify_oauth_state;
    if (!state || !expectedState || state !== expectedState) {
      throw new HttpError(403, "Invalid or expired OAuth state parameter.");
    }
    if (hmac && config.shopifyApiSecret) {
      const isValidHmac = verifyShopifyHmac(query, config.shopifyApiSecret);
      if (!isValidHmac) {
        throw new HttpError(403, "HMAC validation failed.");
      }
    }

    const { accessToken, scope } = await exchangeShopifyCode(shop, code, config);
    await db.shopSession.upsert({
      where: { shop: shop.toLowerCase().trim() },
      create: {
        shop: shop.toLowerCase().trim(),
        accessToken,
        scope: scope || config.shopifyScopes,
      },
      update: {
        accessToken,
        scope: scope || config.shopifyScopes,
      },
    });

    await db.auditEvent.create({
      data: {
        action: "shopify_oauth_connected",
        actorEmail: "shopify_oauth",
        payloadJson: { shop: shop.toLowerCase().trim(), scope: scope || config.shopifyScopes },
      },
    });

    reply.clearCookie("shopify_oauth_state", { path: "/" });
    return reply.redirect("/?shopify=connected");
  };

  app.get("/shopify/callback", handleShopifyCallback);
  app.get("/api/shopify/callback", handleShopifyCallback);

  app.post("/api/auth/login", async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    const email = (body.email ?? "").toLowerCase().trim();
    const admin = await db.adminUser.findUnique({ where: { email } });
    if (!admin || !config.approverEmails.includes(email) || !passwordsMatch(body.password ?? "", config.adminPassword)) {
      throw new HttpError(401, "Email or password is wrong.");
    }
    setSessionCookie(reply, config, email);
    return { email };
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    reply.clearCookie("session", { path: "/" });
    return { ok: true };
  });

  app.get("/api/auth/me", async (request) => {
    const email = actorFromRequest(request, config);
    return { email, approver: config.approverEmails.includes(email) };
  });

  app.get("/api/dashboard", async (request) => {
    actorFromRequest(request, config);
    const [orders, vendors, qualified, blocked, packs] = await Promise.all([
      db.orderSnapshot.count(),
      db.vendor.count(),
      db.orderLine.count({ where: { status: "qualified" } }),
      db.orderLine.count({ where: { status: "blocked" } }),
      db.monthPack.findMany({ orderBy: { yearMonth: "desc" }, take: 6, include: { lines: true } }),
    ]);
    return {
      mode: gateway.mode,
      shop: config.shopifyShop,
      currency: "AED",
      agreement: "NE-SA-2026-09-V3",
      notifyEmail: config.notifyEmail,
      payoutTriggerEnabled: config.enablePayoutTrigger,
      orders,
      vendors,
      qualified,
      blocked,
      packs: packs.map((pack) => ({
        id: pack.id,
        yearMonth: pack.yearMonth,
        status: pack.status,
        payableLines: pack.lines.filter((line) => line.kind === "payable").length,
      })),
    };
  });

  app.get("/api/orders", async (request) => {
    actorFromRequest(request, config);
    const lines = await db.orderLine.findMany({
      include: { vendor: true, order: true },
      orderBy: { paidAt: "desc" },
    });
    return { lines: lines.map(presentLine) };
  });

  async function syncPaidOrders(actor: string, days?: number) {
    const orders = await fetchPaidOrders(config, { limit: 50, days }, db);
    let linesUpserted = 0;
    for (const order of orders) {
      const result = await ingestShopifyOrder(db, config, order, actor);
      linesUpserted += result.lineCount;
    }
    return { imported: orders.length, ordersUpserted: orders.length, linesUpserted };
  }

  app.post("/api/sync", async (request) => {
    const actor = actorFromRequest(request, config);
    const body = (request.body ?? {}) as { days?: number };
    return syncPaidOrders(actor, body.days);
  });

  app.post("/api/sync/orders", async (request) => {
    const actor = actorFromRequest(request, config);
    const body = (request.body ?? {}) as { days?: number };
    return syncPaidOrders(actor, body.days);
  });

  app.post("/api/seed/demo", async (request) => {
    actorFromRequest(request, config);
    return runSeedDemo(db, config);
  });

  app.post("/api/enrich", async (request) => {
    const actor = actorFromRequest(request, config);
    return enrichLines(db, config, actor);
  });

  app.post("/api/qualify", async (request) => {
    actorFromRequest(request, config);
    const qualified = await qualifyAll(db, config);
    return { qualified };
  });

  app.post("/api/requalify", async (request) => {
    const actor = actorFromRequest(request, config);
    return requalifyLines(db, config, actor);
  });

  app.get("/api/vendors", async (request) => {
    actorFromRequest(request, config);
    const vendors = await db.vendor.findMany({
      orderBy: { name: "asc" },
      include: {
        invoices: {
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { id: true, number: true, settlementLineId: true, amount: true, currency: true },
        },
      },
    });
    return { vendors };
  });

  app.post("/api/vendors", async (request) => {
    actorFromRequest(request, config);
    const body = request.body as {
      name?: string;
      email?: string;
      vatRegistered?: boolean;
      stripeAccountId?: string;
      externalKey?: string;
      webkulSellerId?: string;
      tradeLicenceRef?: string;
    };
    if (!body.name?.trim()) throw new HttpError(400, "Vendor name is required.");
    const sellerId = body.webkulSellerId?.trim() || body.externalKey?.trim() || null;
    const vendor = await db.vendor.create({
      data: {
        name: body.name.trim(),
        email: body.email?.trim() || null,
        vatRegistered: Boolean(body.vatRegistered),
        stripeAccountId: body.stripeAccountId?.trim() || null,
        webkulSellerId: sellerId,
        externalKey: sellerId,
        tradeLicenceRef: body.tradeLicenceRef?.trim() || null,
      },
    });
    return { vendor };
  });

  app.patch("/api/vendors/:id", async (request) => {
    actorFromRequest(request, config);
    const { id } = request.params as { id: string };
    const body = request.body as {
      vatRegistered?: boolean;
      stripeAccountId?: string | null;
      email?: string | null;
      active?: boolean;
      tradeLicenceRef?: string | null;
    };
    const vendor = await db.vendor.update({
      where: { id },
      data: {
        vatRegistered: body.vatRegistered,
        stripeAccountId: body.stripeAccountId,
        email: body.email,
        active: body.active,
        tradeLicenceRef: body.tradeLicenceRef,
      },
    });
    return { vendor };
  });

  app.get("/api/packs", async (request) => {
    actorFromRequest(request, config);
    const packs = await db.monthPack.findMany({
      orderBy: { yearMonth: "desc" },
      include: { lines: { include: { vendor: true, orderLines: true } } },
    });
    return { packs: packs.map(presentPack) };
  });

  app.get("/api/packs/:id", async (request) => {
    actorFromRequest(request, config);
    const { id } = request.params as { id: string };
    return { pack: presentPack(await getPack(db, id)) };
  });

  app.post("/api/packs/generate", async (request) => {
    const actor = actorFromRequest(request, config);
    const body = request.body as { yearMonth?: string };
    if (!body.yearMonth) throw new HttpError(400, "yearMonth is required.");
    const pack = await generateMonthPack(db, config, body.yearMonth, actor);
    return { pack: presentPack(pack) };
  });

  app.post("/api/packs/:id/submit", async (request) => {
    const actor = actorFromRequest(request, config);
    const { id } = request.params as { id: string };
    return { pack: presentPack(await submitPack(db, config, mailer, id, actor)) };
  });

  app.post("/api/packs/:id/approve", async (request) => {
    const actor = actorFromRequest(request, config);
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { lineId?: string };
    return { pack: presentPack(await approvePack(db, config, mailer, id, actor, body.lineId)) };
  });

  app.post("/api/packs/:id/execute", async (request) => {
    const actor = actorFromRequest(request, config);
    const { id } = request.params as { id: string };
    const results = await executePack(db, config, mailer, gateway, id, actor);
    return { results, pack: presentPack(await getPack(db, id)) };
  });

  app.post("/api/packs/:id/reopen", async (request) => {
    const actor = actorFromRequest(request, config);
    const { id } = request.params as { id: string };
    const pack = await getPack(db, id);
    if (pack.status !== "pending_approval") {
      throw new HttpError(409, "Only a pack waiting for approval can be reopened.");
    }
    await db.monthPack.update({ where: { id }, data: { status: "draft" } });
    const settlementIds = pack.lines.map((line) => line.id);
    if (settlementIds.length > 0) {
      await db.orderLine.updateMany({
        where: { settlementLineId: { in: settlementIds } },
        data: { settlementLineId: null, status: "open" },
      });
      await db.settlementLine.deleteMany({ where: { monthPackId: id } });
    }
    return { pack: presentPack(await generateMonthPack(db, config, pack.yearMonth, actor)) };
  });

  app.get("/api/reports/owner", async (request, reply) => {
    actorFromRequest(request, config);
    const query = request.query as { period?: string; format?: string };
    const period = query.period || new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dubai" }).slice(0, 7);
    const report = await ownerSalesReport(db, period);
    if (query.format === "csv") {
      reply.header("content-type", "text/csv; charset=utf-8");
      reply.header("content-disposition", `attachment; filename="owner-sales-${period}.csv"`);
      return reply.send(ownerReportCsv(report));
    }
    return report;
  });

  app.get("/api/rules", async (request) => {
    actorFromRequest(request, config);
    const versions = await listRules(db);
    return { versions };
  });

  app.post("/api/rules", async (request) => {
    const actor = actorFromRequest(request, config);
    const version = await createDraftRule(db, config, actor, request.body ?? {});
    return { version };
  });

  app.post("/api/rules/:id/submit", async (request) => {
    const actor = actorFromRequest(request, config);
    const { id } = request.params as { id: string };
    return { version: await submitRule(db, config, mailer, id, actor) };
  });

  app.post("/api/rules/:id/approve", async (request) => {
    const actor = actorFromRequest(request, config);
    const { id } = request.params as { id: string };
    return { version: await approveRule(db, config, mailer, id, actor) };
  });

  app.get("/api/lines/:id/invoice", async (request, reply) => {
    const actor = actorFromRequest(request, config);
    const { id } = request.params as { id: string };
    try {
      await ensureSettlementInvoice(db, config, mailer, { lineId: id, actorEmail: actor });
    } catch (error) {
      if (error instanceof HttpError && error.status === 409) {
        throw new HttpError(404, "No payment advice for this line yet.");
      }
      throw error;
    }
    const pdf = await invoicePdfForLine(db, id);
    reply.header("content-type", "application/pdf");
    reply.header("content-disposition", `attachment; filename="${pdf.filename}"`);
    return reply.send(pdf.bytes);
  });

  app.post("/api/lines/:id/payout", async (request) => {
    const actor = actorFromRequest(request, config);
    const { id } = request.params as { id: string };
    const attempt = await requestBankPayout(db, config, gateway, id, actor);
    return { attempt };
  });

  app.post("/api/stripe/webhook", async (request) => {
    const raw = (request as FastifyRequest & { rawBody?: string }).rawBody ?? "";
    const signature = request.headers["stripe-signature"];
    if (typeof signature !== "string") throw new HttpError(400, "Missing Stripe signature.");
    const event = constructStripeEvent(config, raw, signature);
    if (event.type.startsWith("payout.")) {
      await applyPayoutEvent(db, event as Parameters<typeof applyPayoutEvent>[1]);
    }
    return { received: true };
  });

  app.get("/api/audit", async (request) => {
    actorFromRequest(request, config);
    const [events, emails] = await Promise.all([
      db.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
      db.emailMessage.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    ]);
    return { events, emails };
  });

  const webRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/public");
  await app.register(fastifyStatic, { root: webRoot });

  return app;
}
