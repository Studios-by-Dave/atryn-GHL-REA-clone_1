import { describe, expect, it } from "vitest";
import { resolveTenantRole } from "./policy";

describe("resolveTenantRole", () => {
  it("grants org owners/admins access to active org sub-accounts", () => {
    expect(
      resolveTenantRole({
        subAccountStatus: "active",
        orgMembership: { role: "OWNER", status: "ACTIVE" },
        subAccountMembership: null,
      }),
    ).toBe("OWNER");
    expect(
      resolveTenantRole({
        subAccountStatus: "active",
        orgMembership: { role: "ADMIN", status: "ACTIVE" },
        subAccountMembership: null,
      }),
    ).toBe("ADMIN");
  });

  it("requires active direct membership for agents and client users", () => {
    expect(
      resolveTenantRole({
        subAccountStatus: "active",
        orgMembership: { role: "AGENT", status: "ACTIVE" },
        subAccountMembership: null,
      }),
    ).toBeNull();
    expect(
      resolveTenantRole({
        subAccountStatus: "active",
        orgMembership: null,
        subAccountMembership: { role: "CLIENT_USER", status: "ACTIVE" },
      }),
    ).toBe("CLIENT_USER");
  });

  it("denies cross-tenant, suspended, and inactive memberships", () => {
    expect(
      resolveTenantRole({
        subAccountStatus: "active",
        orgMembership: null,
        subAccountMembership: null,
      }),
    ).toBeNull();
    expect(
      resolveTenantRole({
        subAccountStatus: "active",
        orgMembership: null,
        subAccountMembership: { role: "AGENT", status: "SUSPENDED" },
      }),
    ).toBeNull();
    expect(
      resolveTenantRole({
        subAccountStatus: "suspended",
        orgMembership: { role: "OWNER", status: "ACTIVE" },
        subAccountMembership: null,
      }),
    ).toBeNull();
  });
});
