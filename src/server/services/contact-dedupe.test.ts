import { describe, expect, it } from "vitest";
import { buildIdentity, mergeContactDraft } from "@/server/services/contact-dedupe";

const existing = {
  firstName: "Jane",
  lastName: "Doe",
  email: "jane@example.com",
  phone: "+15550000001",
  company: "Acme",
  source: "web-form",
  ownerUserId: "11111111-1111-4111-8111-111111111111",
  emailNormalized: "jane@example.com",
  phoneNormalized: "+15550000001",
};

describe("buildIdentity", () => {
  it("normalizes email and phone for dedupe", () => {
    expect(buildIdentity({ email: " JANE@Example.com ", phone: "(555) 000-0002" })).toEqual({
      emailNormalized: "jane@example.com",
      phoneNormalized: "+15550000002",
    });
  });

  it("allows email-only and phone-only contacts", () => {
    expect(buildIdentity({ email: "", phone: "" })).toEqual({
      emailNormalized: null,
      phoneNormalized: null,
    });
  });
});

describe("mergeContactDraft", () => {
  it("fills missing fields without clearing existing ones", () => {
    const merged = mergeContactDraft(
      { ...existing, lastName: "", company: null, phone: null },
      {
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        phone: "(555) 000-0003",
        company: "",
        source: null,
        ownerUserId: null,
      },
      buildIdentity({ email: "jane@example.com", phone: "(555) 000-0003" }),
    );

    expect(merged.lastName).toBe("Doe");
    expect(merged.company).toBeNull();
    expect(merged.phone).toBe("(555) 000-0003");
    expect(merged.phoneNormalized).toBe("+15550000003");
  });

  it("preserves the original source for attribution", () => {
    const merged = mergeContactDraft(
      existing,
      {
        firstName: "Janet",
        lastName: "Doe",
        email: "jane@example.com",
        phone: null,
        company: null,
        source: "import",
        ownerUserId: null,
      },
      buildIdentity({ email: "jane@example.com" }),
    );

    expect(merged.source).toBe("web-form");
    expect(merged.firstName).toBe("Janet");
  });
});
