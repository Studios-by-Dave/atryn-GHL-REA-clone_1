import type { Prisma } from "@/generated/prisma/client";

type AuditClient = Pick<Prisma.TransactionClient, "auditLog">;

type AuditEntry = {
  orgId?: string | null;
  subAccountId?: string | null;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Prisma.InputJsonObject;
};

export async function writeAuditLog(
  client: AuditClient,
  entry: AuditEntry,
): Promise<void> {
  await client.auditLog.create({
    data: {
      orgId: entry.orgId,
      subAccountId: entry.subAccountId,
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: entry.metadata,
    },
  });
}
