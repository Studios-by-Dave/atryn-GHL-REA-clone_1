import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

export const pipelineInputSchema = z.object({
  name: z.string().trim().min(1, "Pipeline name is required.").max(80),
});

export type PipelineInput = z.infer<typeof pipelineInputSchema>;

export const stageInputSchema = z.object({
  name: z.string().trim().min(1, "Stage name is required.").max(60),
  probability: z.coerce
    .number()
    .int()
    .min(0, "Probability must be at least 0.")
    .max(100, "Probability cannot exceed 100.")
    .optional()
    .transform((value) => (value === undefined ? 0 : value)),
  isWon: z
    .union([z.literal("on"), z.literal("")])
    .optional()
    .transform((value) => value === "on"),
  isLost: z
    .union([z.literal("on"), z.literal("")])
    .optional()
    .transform((value) => value === "on"),
});

export type StageInput = z.infer<typeof stageInputSchema>;

export const opportunityInputSchema = z.object({
  pipelineId: z.uuid(),
  stageId: z.uuid(),
  contactId: z.uuid(),
  name: z.string().trim().min(1, "Opportunity name is required.").max(120),
  value: z.coerce
    .number()
    .min(0, "Value cannot be negative.")
    .max(99_999_999, "Value is too large."),
  currency: z
    .string()
    .trim()
    .max(3)
    .default("USD")
    .transform((value) => (value.length === 3 ? value.toUpperCase() : "USD")),
  assignedUserId: z
    .union([z.literal(""), z.uuid()])
    .optional()
    .transform((value) => value || null),
  source: optionalText(60),
  notes: optionalText(2_000),
  expectedCloseDate: z
    .string()
    .trim()
    .refine((value) => !Number.isNaN(Date.parse(value)), "Enter a valid date.")
    .optional()
    .nullable()
    .transform((value) => (value ? new Date(value).toISOString() : null)),
});

export type OpportunityInput = z.infer<typeof opportunityInputSchema>;

export const opportunityUpdateSchema = opportunityInputSchema
  .omit({ pipelineId: true, contactId: true })
  .extend({
    // Stage changes normally go through the dedicated move flow; the edit form
    // resends the current stageId purely so ownership can be re-validated.
    stageId: z.uuid(),
  });

export type OpportunityUpdateInput = z.infer<typeof opportunityUpdateSchema>;

export const moveOpportunitySchema = z.object({
  opportunityId: z.uuid(),
  stageId: z.uuid(),
});

export const boardQuerySchema = z.object({
  assignee: z.union([z.literal(""), z.uuid()]).optional().default(""),
  status: z.enum(["all", "OPEN", "WON", "LOST"]).optional().default("all"),
  valueMin: z.coerce.number().min(0).optional().default(0),
  closeBefore: z
    .string()
    .trim()
    .refine((value) => value === "" || !Number.isNaN(Date.parse(value)), "Enter a valid date.")
    .optional()
    .default(""),
});

export type BoardQuery = z.infer<typeof boardQuerySchema>;

export function parseBoardQuery(
  input: Record<string, string | string[] | undefined>,
): BoardQuery {
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  return boardQuerySchema.parse({
    assignee: first(input.assignee) ?? "",
    status: first(input.status) ?? "all",
    valueMin: first(input.valueMin) || 0,
    closeBefore: first(input.closeBefore) ?? "",
  });
}
