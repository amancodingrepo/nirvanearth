import type { PrismaClient } from "@prisma/client";
import { recordAudit } from "./audit.ts";
import type { AppConfig } from "./config.ts";

export interface OutboundMail {
  to: string;
  from: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: OutboundMail): Promise<void>;
}

export function createMailer(config: AppConfig): Mailer {
  if (!config.resendApiKey) {
    return {
      async send() {
        return;
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
      if (!response.ok) {
        throw new Error(`Email provider returned ${response.status}: ${await response.text()}`);
      }
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
  try {
    await mailer.send({
      to: config.notifyEmail,
      from: config.emailFrom,
      subject: input.subject,
      text: input.text,
    });
  } catch (error) {
    delivery = "failed";
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
      error: error instanceof Error ? error.message : String(error),
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
  });
}
