import { z } from "zod";
import { FormFieldType } from "@/generated/prisma/enums";

export const formStatuses = ["DRAFT", "ACTIVE", "PAUSED"] as const;

export const formInputSchema = z.object({
  name: z.string().trim().min(1, "Form name is required.").max(80),
});

export type FormInput = z.infer<typeof formInputSchema>;

// Field machine keys map into submission payloads (`data[field.name]`), so a
// small set of reserved keys can never be claimed by builder fields.
export const RESERVED_FIELD_NAMES = [
  "honeypot",
  "formid",
  "subaccountid",
  "contactid",
  "utmsource",
  "utmmedium",
  "utmcampaign",
  "utmcontent",
  "utmterm",
] as const;

export const FIELD_NAME_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;

const requiredFlag = z
  .union([z.literal("on"), z.literal("")])
  .optional()
  .transform((value) => value === "on");

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

// Options arrive as a multi-line textarea: one choice per line.
export const fieldOptionsSchema = z
  .string()
  .max(4_000)
  .optional()
  .default("")
  .transform((value) => {
    // De-dupe case-insensitively, keeping the first spelling of each choice.
    const seen = new Set<string>();
    const options: string[] = [];
    for (const line of value.split("\n")) {
      const option = line.trim();
      const key = option.toLowerCase();
      if (!option || seen.has(key)) {
        continue;
      }
      seen.add(key);
      options.push(option);
    }
    return options;
  })
  .refine((options) => options.length <= 50, "Use 50 options or fewer.");

export const fieldInputSchema = z
  .object({
    label: z.string().trim().min(1, "Field label is required.").max(120),
    name: z
      .string()
      .trim()
      .max(40)
      .regex(
        FIELD_NAME_PATTERN,
        "Field key must start with a letter and use only lowercase letters, numbers, and underscores.",
      )
      .refine(
        (name) =>
          !RESERVED_FIELD_NAMES.includes(
            name.toLowerCase().replace(/[^a-z0-9]/g, "") as (typeof RESERVED_FIELD_NAMES)[number],
          ),
        "That field key is reserved.",
      ),
    type: z.enum(FormFieldType),
    required: requiredFlag,
    placeholder: optionalText(120),
    helpText: optionalText(300),
    options: fieldOptionsSchema,
  })
  .refine(
    (field) => field.type !== "DROPDOWN" || field.options.length >= 1,
    "Dropdown fields need at least one option.",
  )
  .refine(
    (field) =>
      field.type === "DROPDOWN" ||
      field.options.length === 0 ||
      field.type === "CHECKBOX",
    "Only dropdown fields take options.",
  );

export type FieldInput = z.infer<typeof fieldInputSchema>;

export const fieldUpdateSchema = fieldInputSchema.extend({
  fieldId: z.uuid(),
});

export const reorderFieldsSchema = z.object({
  fieldIds: z.array(z.uuid()).min(1, "Add at least one field first."),
});

export const formSettingsSchema = z
  .object({
    name: z.string().trim().min(1, "Form name is required.").max(80),
    submitLabel: z
      .string()
      .trim()
      .max(60)
      .optional()
      .default("")
      .transform((value) => value || "Submit"),
    successMessage: z
      .string()
      .trim()
      .max(500)
      .optional()
      .default("")
      .transform(
        (value) => value || "Thanks! We'll be in touch shortly.",
      ),
    redirectUrl: z
      .string()
      .trim()
      .max(500)
      .optional()
      .default("")
      .transform((value) => (value && z.url().safeParse(value).success ? value : null)),
    consentText: optionalText(1_000),
    autoTags: z
      .string()
      .max(2_000)
      .optional()
      .default("")
      .transform((value) =>
        Array.from(
          new Set(
            value
              .split(/[,\n]/)
              .map((tag) => tag.trim())
              .filter(Boolean),
          ),
        ).slice(0, 30),
      ),
  });

export type FormSettingsInput = z.infer<typeof formSettingsSchema>;

export const submissionValueSchema = z.union([
  z.string().max(5_000),
  z.boolean(),
  z.array(z.string().max(1_000)).max(50),
]);

/**
 * Parses a raw public payload value against a field definition. Values outside
 * the field's declared shape are rejected so stored submissions stay typed.
 */
export function parseSubmissionValue(
  type: FormFieldType,
  options: readonly string[],
  raw: unknown,
): { ok: true; value: string | boolean | string[] | null } | { ok: false; error: string } {
  if (type === "CHECKBOX" || type === "CONSENT") {
    return { ok: true, value: raw === true || raw === "on" || raw === "true" || raw === "1" };
  }

  const single = typeof raw === "string" ? raw.trim() : null;
  if (!single) {
    return { ok: true, value: null };
  }

  switch (type) {
    case "EMAIL": {
      return z.email().safeParse(single.toLowerCase()).success
        ? { ok: true, value: single.toLowerCase() }
        : { ok: false, error: "Enter a valid email address." };
    }
    case "PHONE": {
      const digits = single.replace(/[^\d+]/g, "");
      return digits.length >= 7 && digits.length <= 16
        ? { ok: true, value: single }
        : { ok: false, error: "Enter a valid phone number." };
    }
    case "DATE": {
      return Number.isNaN(Date.parse(single))
        ? { ok: false, error: "Enter a valid date." }
        : { ok: true, value: single };
    }
    case "DROPDOWN": {
      if (options.length > 0 && !options.includes(single)) {
        return { ok: false, error: "Choose one of the available options." };
      }
      return { ok: true, value: single };
    }
    default:
      return { ok: true, value: single.slice(0, 5_000) };
  }
}
