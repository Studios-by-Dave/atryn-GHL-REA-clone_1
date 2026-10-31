import { describe, expect, it } from "vitest";
import { displayName, normalizeEmail, normalizePhone } from "@/lib/normalize";

describe("normalizeEmail", () => {
  it("lowercases and trims", () => {
    expect(normalizeEmail("  Jane@Example.COM ")).toBe("jane@example.com");
  });

  it("returns null for empty input", () => {
    expect(normalizeEmail("   ")).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe("normalizePhone", () => {
  it("formats a 10-digit US number as E.164", () => {
    expect(normalizePhone("(555) 123-4567")).toBe("+15551234567");
  });

  it("keeps an existing country code", () => {
    expect(normalizePhone("1 555 123 4567")).toBe("+15551234567");
    expect(normalizePhone("+44 20 7946 0958")).toBe("+442079460958");
  });

  it("rejects values that cannot be a phone number", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("not a phone")).toBeNull();
  });
});

describe("displayName", () => {
  it("joins available name parts", () => {
    expect(displayName({ firstName: "Jane", lastName: "Doe" })).toBe("Jane Doe");
    expect(displayName({ firstName: "Jane", lastName: "" })).toBe("Jane");
  });
});
