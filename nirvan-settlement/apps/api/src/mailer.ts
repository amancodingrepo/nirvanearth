import type { PrismaClient } from "@prisma/client";
import { recordAudit } from "./audit.ts";
import type { AppConfig } from "./config.ts";

export interface OutboundMail {
  to: string;
  from: string;
  subject: string;
  text: string;
}

export interface MailSendResult {
  id: string | null;
}

export interface Mailer {
  send(message: OutboundMail): Promise<MailSendResult>;
}

const APPROVER_NOTIFY = "admin@nirvanearth.com";

/** Resend accepts `re_` ids and UUIDs. Store either. Never store a key-shaped value. */
export function readProviderMessageId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  if (!id || id.length > 128) return null;
  if (/^(sk|rk|pk)_/i.test(id)) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

function redactEmailError(status: number, body: string): string {
  const cleaned = body
    .replace(/\b(?:sk|rk|pk)_(?:test|live)_[A-Za-z0-9]+\b/g, "[redacted-key]")
    .replace(/bearer\s+[A-Za-z0-9._\-]+/gi, "bearer [redacted]")
    .slice(0, 300);
  return `Email provider returned ${status}: ${cleaned}`;
}

export function createMailer(config: AppConfig): Mailer {
  if (!config.resendApiKey) {
    return {
      async send() {
        return { id: null };
      },
    };
  }

  return {
    async send(message) {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: message.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
        }),
      });
      const raw = await response.text();
      if (!response.ok) {
        throw new Error(redactEmailError(response.status, raw));
      }
      let id: string | null = null;
      try {
        const parsed = JSON.parse(raw) as { id?: unknown };
        id = readProviderMessageId(parsed.id);
      } catch {
        id = null;
      }
      return { id };
    },
  };
}

export async function notify(
  db: PrismaClient,
  config: AppConfig,
  mailer: Mailer,
  input: { subject: string; text: string; action: string; actorEmail: string },
): Promise<void> {
  let delivery = config.resendApiKey ? "sent" : "outbox";
  let providerMessageId: string | null = null;
  if (config.notifyEmail !== APPROVER_NOTIFY) {
    delivery = "blocked";
    await db.emailMessage.create({
      data: {
        toEmail: config.notifyEmail,
        subject: input.subject,
        body: input.text,
        delivery,
        providerMessageId: null,
      },
    });
    await recordAudit(db, "email.blocked", input.actorEmail, {
      subject: input.subject,
      reason: "notify_recipient_not_approver",
    });
    return;
  }
  try {
    const sent = await mailer.send({
      to: config.notifyEmail,
      from: config.emailFrom,
      subject: input.subject,
      text: input.text,
    });
    providerMessageId = readProviderMessageId(sent.id);
    if (config.resendApiKey && !providerMessageId) delivery = "sent_unconfirmed";
  } catch (error) {
    delivery = "failed";
    const message = error instanceof Error ? error.message : String(error);
    await db.emailMessage.create({
      data: {
        toEmail: config.notifyEmail,
        subject: input.subject,
        body: input.text,
        delivery,
        providerMessageId: null,
      },
    });
    await recordAudit(db, "email.failed", input.actorEmail, {
      subject: input.subject,
      error: message.slice(0, 300),
    });
    return;
  }

  await db.emailMessage.create({
    data: {
      toEmail: config.notifyEmail,
      subject: input.subject,
      body: input.text,
      delivery,
      providerMessageId,
    },
  });
  await recordAudit(db, input.action, input.actorEmail, {
    subject: input.subject,
    delivery,
    to: config.notifyEmail,
    providerMessageId,
  });
}

export async function notifyAddress(
  db: PrismaClient,
  config: AppConfig,
  mailer: Mailer,
  input: { to: string; subject: string; text: string; action: string; actorEmail: string },
): Promise<void> {
  const to = input.to.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    await db.emailMessage.create({
      data: {
        toEmail: input.to.slice(0, 200),
        subject: input.subject,
        body: input.text,
        delivery: "blocked",
        providerMessageId: null,
      },
    });
    await recordAudit(db, "email.blocked", input.actorEmail, {
      subject: input.subject,
      reason: "invalid_vendor_email",
    });
    return;
  }

  let delivery = config.resendApiKey ? "sent" : "outbox";
  let messageId: string | null = null;
  try {
    const sent = await mailer.send({
      to,
      from: config.emailFrom,
      subject: input.subject,
      text: input.text,
    });
    messageId = readProviderMessageId(sent.id);
    if (config.resendApiKey && !messageId) delivery = "sent_unconfirmed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.emailMessage.create({
      data: {
        toEmail: to,
        subject: input.subject,
        body: input.text,
        delivery: "failed",
        providerMessageId: null,
      },
    });
    await recordAudit(db, "email.failed", input.actorEmail, {
      subject: input.subject,
      to,
      error: message.slice(0, 300),
    });
    return;
  }

  await db.emailMessage.create({
    data: {
      toEmail: to,
      subject: input.subject,
      body: input.text,
      delivery,
      providerMessageId: messageId,
    },
  });
  await recordAudit(db, input.action, input.actorEmail, {
    subject: input.subject,
    delivery,
    to,
    providerMessageId: messageId,
  });
}
