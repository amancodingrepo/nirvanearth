import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { actorFromRequest, passwordsMatch, setSessionCookie } from "./auth.ts";
import type { AppConfig } from "./config.ts";
import { HttpError } from "./config.ts";
import { enrichLines, ingestShopifyOrder, qualifyAll } from "./ingest.ts";
import { createMailer, type Mailer } from "./mailer.ts";
import { approvePack, generateMonthPack, getPack, submitPack } from "./pack.ts";
import { executePack } from "./execute.ts";
import { presentLine, presentPack } from "./serialize.ts";
import { fetchPaidOrders } from "./shopify.ts";
import { createStripeGateway, pingStripe } from "./stripe.ts";
import type { TransferGateway } from "./types.ts";

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

  app.setErrorHandler((error, _request, reply) => {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected error";
    reply.status(status).send({ error: message });
  });

  app.get("/api/health", async () => {
    let dbOk = false;
    let dbError: string | undefined;
    try {
      await db.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (error) {
      dbError = error instanceof Error ? error.message : "database unavailable";
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
        error: error instanceof Error ? error.message : "stripe unavailable",
      };
    }

    return {
      ok: dbOk && stripe.ok,
      db: { ok: dbOk, error: dbError },
      stripe,
      mode: gateway.mode,
      shop: config.shopifyShop,
      liveBlocked: !config.allowLive,
    };
  });

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
    const orders = await fetchPaidOrders(config, { limit: 50, days });
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

  app.post("/api/enrich", async (request) => {
    const actor = actorFromRequest(request, config);
    return enrichLines(db, config, actor);
  });

  app.post("/api/qualify", async (request) => {
    actorFromRequest(request, config);
    const qualified = await qualifyAll(db, config);
    return { qualified };
  });

  app.get("/api/vendors", async (request) => {
    actorFromRequest(request, config);
    const vendors = await db.vendor.findMany({ orderBy: { name: "asc" } });
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
