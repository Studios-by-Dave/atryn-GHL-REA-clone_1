import type { UserRole } from "@/generated/prisma/enums";
import { ForbiddenError } from "@/server/auth/errors";
import type { Permission } from "./permissions";
import { hasPermission } from "./permissions";

export type TenantContext = {
  orgId: string;
  subAccountId: string;
  userId: string;
  role: UserRole;
};

export function requirePermission(
  context: TenantContext,
  permission: Permission,
): TenantContext {
  if (!hasPermission(context.role, permission)) {
    throw new ForbiddenError(`Your role cannot perform "${permission}".`);
  }
  return context;
}
