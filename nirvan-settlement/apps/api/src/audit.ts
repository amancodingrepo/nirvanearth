import type { PrismaClient } from "@prisma/client";
import type { Prisma } from "@prisma/client";

export async function recordAudit(
  db: PrismaClient,
  action: string,
  actorEmail: string,
  payload: Prisma.InputJsonValue,
): Promise<void> {
  await db.auditEvent.create({
    data: {
      action,
      actorEmail,
      payloadJson: payload,
    },
  });
}
