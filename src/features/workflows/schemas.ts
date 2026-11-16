import { z } from "zod";

export const workflowInputSchema = z.object({
  name: z.string().trim().min(1, "Workflow name is required.").max(80),
  description: z.string().trim().max(500).optional().default(""),
});

export type WorkflowInput = z.infer<typeof workflowInputSchema>;
