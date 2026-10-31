import "server-only";
import { prisma } from "@/server/db/client";

export async function listAccessibleSubAccounts(userId: string) {
  return prisma.subAccount.findMany({
    where: {
      status: "active",
      OR: [
        { memberships: { some: { userId, status: "ACTIVE" } } },
        {
          org: {
            memberships: {
              some: {
                userId,
                status: "ACTIVE",
                role: { in: ["OWNER", "ADMIN"] },
              },
            },
          },
        },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      orgId: true,
      org: { select: { name: true } },
    },
    orderBy: { name: "asc" },
  });
}
