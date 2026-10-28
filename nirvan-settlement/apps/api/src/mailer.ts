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
        if (typeof parsed.id === "string" && parsed.id.startsWith("re_")) id = parsed.id;
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
    providerMessageId = sent.id;
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
    },
  });
  await recordAudit(db, input.action, input.actorEmail, {
    subject: input.subject,
    delivery,
    to: config.notifyEmail,
    providerMessageId,
  });
}
