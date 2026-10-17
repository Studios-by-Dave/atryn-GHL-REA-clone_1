import type { UserRole } from "@/generated/prisma/enums";

export const permissions = [
  "organization.manage",
  "subAccount.manage",
  "members.invite",
  "contacts.read",
  "contacts.write",
  "contacts.delete",
  "opportunities.read",
  "opportunities.write",
  "opportunities.assign",
  "workflows.read",
  "workflows.manage",
  "reports.read",
  "settings.manage",
] as const;

export type Permission = (typeof permissions)[number];

const permissionMatrix: Record<UserRole, readonly Permission[]> = {
  OWNER: permissions,
  ADMIN: [
    "subAccount.manage",
    "members.invite",
    "contacts.read",
    "contacts.write",
    "contacts.delete",
    "opportunities.read",
    "opportunities.write",
    "opportunities.assign",
    "workflows.read",
    "workflows.manage",
    "reports.read",
    "settings.manage",
  ],
  AGENT: [
    "contacts.read",
    "contacts.write",
    "opportunities.read",
    "opportunities.write",
    "workflows.read",
    "reports.read",
  ],
  CLIENT_USER: ["contacts.read", "opportunities.read"],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return permissionMatrix[role].includes(permission);
}

export function canAssignRole(actorRole: UserRole, targetRole: UserRole): boolean {
  if (actorRole === "OWNER") {
    return targetRole !== "OWNER";
  }
  if (actorRole === "ADMIN") {
    return targetRole === "AGENT" || targetRole === "CLIENT_USER";
  }
  return false;
}
