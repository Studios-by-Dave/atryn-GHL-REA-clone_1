import { describe, expect, it } from "vitest";
import { selectActiveSubAccount } from "./active-sub-account";

const subAccounts = [
  { id: "first", name: "First workspace" },
  { id: "second", name: "Second workspace" },
];

describe("selectActiveSubAccount", () => {
  it("keeps a requested workspace when it is accessible", () => {
    expect(selectActiveSubAccount(subAccounts, "second")).toBe(subAccounts[1]);
  });

  it("falls back to the first accessible workspace for a stale or forged cookie", () => {
    expect(selectActiveSubAccount(subAccounts, "other")).toBe(subAccounts[0]);
    expect(selectActiveSubAccount(subAccounts, undefined)).toBe(subAccounts[0]);
  });

  it("returns null when the user has no accessible workspace", () => {
    expect(selectActiveSubAccount([], undefined)).toBeNull();
  });
});
