import type { ReactNode } from "react";
import { forbidden, notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AppShell } from "@/components/app-shell";
import { AuthenticationRequiredError, ForbiddenError } from "@/server/auth/errors";
import { requireAuthenticatedUser, requireTenantContext } from "@/server/tenant/context";
import { listAccessibleSubAccounts } from "@/server/tenant/sub-accounts";

export const instant = false;

const subAccountIdSchema = z.string().uuid();

type SubAccountLayoutProps = {
  children: ReactNode;
  params: Promise<{ subAccountId: string }>;
};

export default async function SubAccountLayout({
  children,
  params,
}: SubAccountLayoutProps) {
  const { subAccountId } = await params;
  if (!subAccountIdSchema.safeParse(subAccountId).success) {
    notFound();
  }

  let tenantContext;
  let user;
  try {
    [tenantContext, user] = await Promise.all([
      requireTenantContext(subAccountId),
      requireAuthenticatedUser(),
    ]);
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      redirect(`/login?callbackUrl=${encodeURIComponent(`/s/${subAccountId}/dashboard`)}`);
    }
    if (error instanceof ForbiddenError) {
      forbidden();
    }
    throw error;
  }

  const subAccounts = await listAccessibleSubAccounts(tenantContext.userId);
  const activeSubAccount = subAccounts.find((subAccount) => subAccount.id === subAccountId);
  if (!activeSubAccount) {
    forbidden();
  }

  return (
    <AppShell
      activeSubAccount={activeSubAccount}
      subAccounts={subAccounts}
      userName={user.name ?? user.email ?? "Your account"}
    >
      {children}
    </AppShell>
  );
}
