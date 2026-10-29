import type { PrismaClient } from "@prisma/client";
import { RULES_VERSION } from "@nirvan/rules";
import { recordAudit } from "./audit.ts";
import { assertApprover, type AppConfig, HttpError } from "./config.ts";
import { notify, type Mailer } from "./mailer.ts";

export interface RulePayload {
  commissionRate: number;
  returnWindowDays: number;
  platformOwnTags: string[];
  platformOwnVendorNames: string[];
  includeVendorVatInNet: boolean;
  excludeDeliveryAllowanceFromCommissionBase: boolean;
  notes: string;
  effectiveFrom: string | null;
  rulesVersion: string;
}

export function payloadFromConfig(config: AppConfig): RulePayload {
  return {
    commissionRate: config.commissionRate,
    returnWindowDays: config.returnWindowDays,
    platformOwnTags: [...config.ownProducts.tags],
    platformOwnVendorNames: [...config.ownProducts.vendorNames],
    includeVendorVatInNet: true,
    excludeDeliveryAllowanceFromCommissionBase: true,
    notes: "",
    effectiveFrom: null,
    rulesVersion: RULES_VERSION,
  };
}

export function readPayload(value: unknown, fallback: RulePayload): RulePayload {
  const raw = value && typeof value === "object" ? (value as Partial<RulePayload>) : {};
  const rate = Number(raw.commissionRate ?? fallback.commissionRate);
  const days = Number(raw.returnWindowDays ?? fallback.returnWindowDays);
  if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
    throw new HttpError(400, "commission_rate must be between 0 and 1.");
  }
  if (!Number.isInteger(days) || days < 0 || days > 365) {
    throw new HttpError(400, "return_window_days must be a whole number from 0 to 365.");
  }
  return {
    commissionRate: rate,
    returnWindowDays: days,
    platformOwnTags: stringList(raw.platformOwnTags, fallback.platformOwnTags),
    platformOwnVendorNames: stringList(raw.platformOwnVendorNames, fallback.platformOwnVendorNames),
    includeVendorVatInNet: raw.includeVendorVatInNet !== false,
    excludeDeliveryAllowanceFromCommissionBase: raw.excludeDeliveryAllowanceFromCommissionBase !== false,
    notes: typeof raw.notes === "string" ? raw.notes.slice(0, 500) : fallback.notes,
    effectiveFrom: typeof raw.effectiveFrom === "string" && raw.effectiveFrom ? raw.effectiveFrom : null,
    rulesVersion: typeof raw.rulesVersion === "string" && raw.rulesVersion ? raw.rulesVersion : fallback.rulesVersion,
  };
}

function stringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

export async function ensureActiveRule(db: PrismaClient, config: AppConfig) {
  const active = await db.settlementRuleVersion.findFirst({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
  });
  if (active) return active;
  return db.settlementRuleVersion.create({
    data: {
      versionLabel: RULES_VERSION,
      payload: payloadFromConfig(config),
      status: "active",
      createdBy: "system",
      approvedBy: "system",
      approvedAt: new Date(),
    },
  });
}

export async function listRules(db: PrismaClient) {
  return db.settlementRuleVersion.findMany({ orderBy: { createdAt: "desc" } });
}

export async function createDraftRule(
  db: PrismaClient,
  config: AppConfig,
  actorEmail: string,
  patch: unknown,
) {
  const current = await ensureActiveRule(db, config);
  const fallback = readPayload(current.payload, payloadFromConfig(config));
  const payload = readPayload(patch, fallback);
  const body = patch && typeof patch === "object" ? (patch as { versionLabel?: string }) : {};
  const versionLabel = (body.versionLabel ?? fallback.rulesVersion).trim();
  if (!versionLabel) throw new HttpError(400, "version_label is required.");
  const draft = await db.settlementRuleVersion.create({
    data: {
      versionLabel,
      payload,
      status: "draft",
      createdBy: actorEmail,
    },
  });
  await recordAudit(db, "rule.drafted", actorEmail, { ruleId: draft.id, versionLabel });
  return draft;
}

export async function submitRule(
  db: PrismaClient,
  config: AppConfig,
  mailer: Mailer,
  id: string,
  actorEmail: string,
) {
  const rule = await db.settlementRuleVersion.findUnique({ where: { id } });
  if (!rule) throw new HttpError(404, "Rule version not found.");
  if (rule.status !== "draft") throw new HttpError(409, "Only a draft can be submitted.");
  const updated = await db.settlementRuleVersion.update({
    where: { id },
    data: { status: "pending_approval" },
  });
  await recordAudit(db, "rule.submitted", actorEmail, { ruleId: id, versionLabel: rule.versionLabel });
  await notify(db, config, mailer, {
    action: "rule.submitted",
    actorEmail,
    subject: `Settlement rules ${rule.versionLabel} awaiting approval`,
    text: `${actorEmail} submitted rule version ${rule.versionLabel}. It does not apply until you approve it.`,
  });
  return updated;
}

export async function approveRule(
  db: PrismaClient,
  config: AppConfig,
  mailer: Mailer,
  id: string,
  actorEmail: string,
) {
  assertApprover(config, actorEmail);
  const rule = await db.settlementRuleVersion.findUnique({ where: { id } });
  if (!rule) throw new HttpError(404, "Rule version not found.");
  if (rule.status !== "pending_approval") {
    throw new HttpError(409, "Only a submitted rule version can be approved.");
  }
  const now = new Date();
  await db.settlementRuleVersion.updateMany({
    where: { status: "active", id: { not: id } },
    data: { status: "superseded" },
  });
  const updated = await db.settlementRuleVersion.update({
    where: { id },
    data: { status: "active", approvedBy: actorEmail, approvedAt: now },
  });
  await recordAudit(db, "rule.approved", actorEmail, { ruleId: id, versionLabel: rule.versionLabel });
  await notify(db, config, mailer, {
    action: "rule.approved",
    actorEmail,
    subject: `Settlement rules ${rule.versionLabel} approved`,
    text: `${actorEmail} approved rule version ${rule.versionLabel}. Packs generated after this use it. Closed packs keep the version stored on the pack.`,
  });
  return updated;
}
