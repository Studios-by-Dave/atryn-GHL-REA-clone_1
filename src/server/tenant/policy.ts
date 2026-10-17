import type { UserRole } from "@/generated/prisma/enums";

type Membership = {
  role: UserRole;
  status: string;
} | null;

export function resolveTenantRole(input: {
  subAccountStatus: string;
  orgMembership: Membership;
  subAccountMembership: Membership;
}): UserRole | null {
  if (input.subAccountStatus !== "active") {
    return null;
  }

  if (
    input.orgMembership?.status === "ACTIVE" &&
    (input.orgMembership.role === "OWNER" ||
      input.orgMembership.role === "ADMIN")
  ) {
    return input.orgMembership.role;
  }

  if (input.subAccountMembership?.status === "ACTIVE") {
    return input.subAccountMembership.role;
  }

  return null;
}
