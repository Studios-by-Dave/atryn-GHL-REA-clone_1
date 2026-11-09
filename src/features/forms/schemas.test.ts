import { describe, expect, it } from "vitest";
import type { FormFieldType } from "@/generated/prisma/enums";
import {
  fieldInputSchema,
  fieldOptionsSchema,
  formSettingsSchema,
  parseSubmissionValue,
} from "./schemas";

describe("fieldInputSchema", () => {
  const base = {
    label: "Email",
    name: "email_of_lead",
    type: "EMAIL",
    required: "on",
    placeholder: "",
    helpText: "",
    options: "",
  };

  it("accepts a well-formed field", () => {
    const parsed = fieldInputSchema.safeParse(base);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.required).toBe(true);
      expect(parsed.data.placeholder).toBeNull();
    }
  });

  it("rejects machine keys with spaces or uppercase", () => {
    expect(fieldInputSchema.safeParse({ ...base, name: "Email Field" }).success).toBe(false);
    expect(fieldInputSchema.safeParse({ ...base, name: "1bad" }).success).toBe(false);
  });

  it("rejects reserved field keys case-insensitively", () => {
    expect(fieldInputSchema.safeParse({ ...base, name: "Honeypot" }).success).toBe(false);
    expect(fieldInputSchema.safeParse({ ...base, name: "utm_source" }).success).toBe(false);
  });

  it("requires at least one option for dropdowns", () => {
    const dropdown = { ...base, type: "DROPDOWN", options: "  \n  \n" };
    expect(fieldInputSchema.safeParse(dropdown).success).toBe(false);
    const withOptions = { ...base, type: "DROPDOWN", options: "Email\nPhone\n" };
    const parsed = fieldInputSchema.safeParse(withOptions);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.options).toEqual(["Email", "Phone"]);
    }
  });

  it("rejects options on non-dropdown field types", () => {
    expect(
      fieldInputSchema.safeParse({ ...base, type: "TEXTAREA", options: "A\nB" }).success,
    ).toBe(false);
  });

  it("ignores unknown options field types gracefully for CONSENT", () => {
    const parsed = fieldInputSchema.safeParse({ ...base, type: "CONSENT", options: "" });
    expect(parsed.success).toBe(true);
  });
});

describe("fieldOptionsSchema", () => {
  it("splits lines, trims, and de-duplicates", () => {
    const parsed = fieldOptionsSchema.safeParse("Email\n email \nPhone\n\nPhone");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual(["Email", "Phone"]);
    }
  });

  it("returns an empty list for blank text", () => {
    const parsed = fieldOptionsSchema.safeParse("");
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual([]);
    }
  });
});

describe("formSettingsSchema", () => {
  it("applies defaults for submit label and success message", () => {
    const parsed = formSettingsSchema.safeParse({ name: "Lead Form" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.submitLabel).toBe("Submit");
      expect(parsed.data.successMessage).toBe("Thanks! We'll be in touch shortly.");
      expect(parsed.data.redirectUrl).toBeNull();
      expect(parsed.data.autoTags).toEqual([]);
    }
  });

  it("rejects non-URL redirect values", () => {
    const parsed = formSettingsSchema.safeParse({
      name: "Lead Form",
      redirectUrl: "not a url",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.redirectUrl).toBeNull();
    }
  });

  it("accepts https redirect targets", () => {
    const parsed = formSettingsSchema.safeParse({
      name: "Lead Form",
      redirectUrl: "https://example.com/thanks",
    });
    expect(
      parsed.success && "data" in parsed && parsed.data.redirectUrl === "https://example.com/thanks",
    ).toBe(true);
  });

  it("parses auto tags from comma or newline separated text", () => {
    const parsed = formSettingsSchema.safeParse({ name: "F", autoTags: "lead, hot\n hot " });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.autoTags).toEqual(["lead", "hot"]);
    }
  });
});

describe("parseSubmissionValue", () => {
  const run = (type: FormFieldType, raw: unknown, options: string[] = []) =>
    parseSubmissionValue(type, options, raw);

  it("treats checkbox/consent as booleans", () => {
    expect(run("CHECKBOX", "on")).toMatchObject({ ok: true, value: true });
    expect(run("CONSENT", "false")).toMatchObject({ ok: true, value: false });
    expect(run("CHECKBOX", undefined)).toMatchObject({ ok: true, value: false });
  });

  it("maps empty input to null for text types", () => {
    expect(run("TEXT", "   ")).toMatchObject({ ok: true, value: null });
  });

  it("validates email", () => {
    expect(run("EMAIL", "Lead@Example.com ")).toMatchObject({
      ok: true,
      value: "lead@example.com",
    });
    expect(run("EMAIL", "nope").ok).toBe(false);
  });

  it("validates phone length", () => {
    expect(run("PHONE", "555").ok).toBe(false);
    expect(run("PHONE", "+1 (555) 123-4567")).toMatchObject({ ok: true, value: "+1 (555) 123-4567" });
  });

  it("validates dates", () => {
    expect(run("DATE", "99/99/9999").ok).toBe(false);
    expect(run("DATE", "2026-12-01")).toMatchObject({ ok: true, value: "2026-12-01" });
  });

  it("restricts dropdown values to declared options", () => {
    expect(run("DROPDOWN", "Phone", ["Email", "Phone"])).toMatchObject({ ok: true, value: "Phone" });
    expect(run("DROPDOWN", "Fax", ["Email", "Phone"]).ok).toBe(false);
    expect(run("DROPDOWN", "Fax")).toMatchObject({ ok: true, value: "Fax" });
  });

  it("caps free text length", () => {
    const result = run("TEXTAREA", "x".repeat(6_000));
    expect(result).toMatchObject({ ok: true, value: "x".repeat(5_000) });
  });
});
