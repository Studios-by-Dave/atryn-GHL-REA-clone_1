import { describe, expect, it } from "vitest";
import { UserRole } from "@/generated/prisma/enums";
import {
  canAssignRole,
  hasPermission,
  permissions,
  type Permission,
} from "./permissions";

const expectedPermissions: Record<UserRole, readonly Permission[]> = {
  OWNER: permissions,
  ADMIN: permissions.filter((permission) => permission !== "organization.manage"),
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

describe("RBAC permission matrix", () => {
  for (const role of Object.values(UserRole)) {
    for (const permission of permissions) {
      it(`${role} ${expectedPermissions[role].includes(permission) ? "can" : "cannot"} ${permission}`, () => {
        expect(hasPermission(role, permission)).toBe(
          expectedPermissions[role].includes(permission),
        );
      });
    }
  }
});

describe("role assignment", () => {
  it("allows owners to assign every role except owner", () => {
    expect(canAssignRole("OWNER", "ADMIN")).toBe(true);
    expect(canAssignRole("OWNER", "AGENT")).toBe(true);
    expect(canAssignRole("OWNER", "CLIENT_USER")).toBe(true);
    expect(canAssignRole("OWNER", "OWNER")).toBe(false);
  });

  it("prevents admins and agents from elevating membership roles", () => {
    expect(canAssignRole("ADMIN", "AGENT")).toBe(true);
    expect(canAssignRole("ADMIN", "CLIENT_USER")).toBe(true);
    expect(canAssignRole("ADMIN", "ADMIN")).toBe(false);
    expect(canAssignRole("AGENT", "CLIENT_USER")).toBe(false);
    expect(canAssignRole("CLIENT_USER", "AGENT")).toBe(false);
  });
});
