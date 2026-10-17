import "server-only";
import { auth } from "../../../auth";
import { prisma } from "@/server/db/client";
import { AuthenticationRequiredError, ForbiddenError } from "@/server/auth/errors";
import type { TenantContext } from "@/server/rbac/guards";
import { resolveTenantRole } from "./policy";

export async function requireAuthenticatedUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthenticationRequiredError();
  }
  return {
    id: session.user.id,
    email: session.user.email?.trim().toLowerCase() ?? null,
  };
}

export async function requireTenantContext(
  subAccountId: string,
): Promise<TenantContext> {
  const user = await requireAuthenticatedUser();
  const subAccount = await prisma.subAccount.findUnique({
    where: { id: subAccountId },
    select: { id: true, orgId: true, status: true },
  });

  if (!subAccount) {
    throw new ForbiddenError();
  }

  const [orgMembership, subAccountMembership] = await Promise.all([
    prisma.orgMembership.findUnique({
      where: { orgId_userId: { orgId: subAccount.orgId, userId: user.id } },
      select: { role: true, status: true },
    }),
    prisma.subAccountMembership.findUnique({
      where: { subAccountId_userId: { subAccountId, userId: user.id } },
      select: { role: true, status: true },
    }),
  ]);

  const role = resolveTenantRole({
    subAccountStatus: subAccount.status,
    orgMembership,
    subAccountMembership,
  });
  if (role) {
    return { orgId: subAccount.orgId, subAccountId, userId: user.id, role };
  }

  throw new ForbiddenError();
}
