import { z } from "zod";
import type { CustomFieldType } from "@/generated/prisma/enums";

export const contactStatuses = ["ACTIVE", "ARCHIVED"] as const;
export const contactSorts = ["newest", "name"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

export const contactInputSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(80),
  lastName: z.string().trim().max(80).optional().default(""),
  email: z
    .union([z.literal(""), z.email("Enter a valid email address.")])
    .optional()
    .transform((value) => value?.trim().toLowerCase() || null),
  phone: optionalText(40),
  company: optionalText(120),
  source: optionalText(60),
  ownerUserId: z
    .union([z.literal(""), z.uuid()])
    .optional()
    .transform((value) => value || null),
});

export type ContactInput = z.infer<typeof contactInputSchema>;

export const contactUpdateSchema = contactInputSchema.extend({
  contactId: z.uuid(),
});

export const contactListQuerySchema = z.object({
  search: z.string().trim().max(120).optional().default(""),
  status: z.enum(["all", ...contactStatuses]).optional().default("ACTIVE"),
  source: z.string().trim().max(60).optional().default(""),
  ownerUserId: z.union([z.literal(""), z.uuid()]).optional().default(""),
  tagId: z.union([z.literal(""), z.uuid()]).optional().default(""),
  sort: z.enum(contactSorts).optional().default("newest"),
  page: z.coerce.number().int().min(1).max(10_000).optional().default(1),
});

export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

export function parseContactListQuery(
  input: Record<string, string | string[] | undefined>,
): ContactListQuery {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  return contactListQuerySchema.parse({
    search: first(input.search) ?? "",
    status: first(input.status) ?? "ACTIVE",
    source: first(input.source) ?? "",
    ownerUserId: first(input.ownerUserId) ?? "",
    tagId: first(input.tagId) ?? "",
    sort: first(input.sort) ?? "newest",
    page: first(input.page) ?? 1,
  });
}

const emailLike = z.email();

const dateLike = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Enter a valid date.");

export type CustomFieldParseResult =
  | { ok: true; value: string | number | boolean | string[] | null }
  | { ok: false; error: string };

export function parseCustomFieldValue(
  type: CustomFieldType,
  raw: string | string[] | undefined,
  options: readonly string[] = [],
): CustomFieldParseResult {
  const single = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = single?.trim() ?? "";

  if (type === "CHECKBOX") {
    return { ok: true, value: raw === "on" || raw === "true" || raw === "1" };
  }

  if (!trimmed) {
    return { ok: true, value: type === "MULTI_SELECT" ? [] : null };
  }

  switch (type) {
    case "NUMBER":
    case "CURRENCY": {
      const parsed = Number(trimmed);
      if (!Number.isFinite(parsed)) {
        return { ok: false, error: "Enter a number." };
      }
      return { ok: true, value: parsed };
    }
    case "DATE": {
      const result = dateLike.safeParse(trimmed);
      return result.success
        ? { ok: true, value: new Date(trimmed).toISOString() }
        : { ok: false, error: result.error.issues[0]?.message ?? "Enter a valid date." };
    }
    case "EMAIL": {
      const result = emailLike.safeParse(trimmed);
      return result.success
        ? { ok: true, value: trimmed.toLowerCase() }
        : { ok: false, error: "Enter a valid email address." };
    }
    case "SELECT": {
      if (options.length > 0 && !options.includes(trimmed)) {
        return { ok: false, error: "Choose one of the available options." };
      }
      return { ok: true, value: trimmed };
    }
    case "MULTI_SELECT": {
      const values = (Array.isArray(raw) ? raw : trimmed.split(","))
        .map((value) => value.trim())
        .filter(Boolean);
      if (options.length > 0) {
        const invalid = values.find((value) => !options.includes(value));
        if (invalid) {
          return { ok: false, error: `"${invalid}" is not an available option.` };
        }
      }
      return { ok: true, value: values };
    }
    default:
      return { ok: true, value: trimmed };
  }
}

export const importContactsSchema = z.object({
  csv: z.string().trim().min(1, "Paste at least one contact.").max(200_000),
});

export const noteInputSchema = z.object({
  contactId: z.uuid(),
  body: z.string().trim().min(1, "Write a note first.").max(5_000),
});

export const bulkTagSchema = z.object({
  tagId: z.uuid(),
  contactIds: z.array(z.uuid()).min(1, "Select at least one contact.").max(500),
});

export const tagInputSchema = z.object({
  name: z.string().trim().min(1, "Tag name is required.").max(40),
});

export const csvRowSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().max(80).optional().default(""),
  email: z
    .union([z.literal(""), z.email()])
    .optional()
    .transform((value) => value?.trim().toLowerCase() || null),
  phone: z.string().trim().max(40).optional().default(""),
  company: z.string().trim().max(120).optional().default(""),
  source: z.string().trim().max(60).optional().default("import"),
});

export type CsvRow = z.infer<typeof csvRowSchema>;
