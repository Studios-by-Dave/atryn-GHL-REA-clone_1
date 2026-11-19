import { z } from "zod";

export const conversationStatuses = ["OPEN", "ARCHIVED"] as const;
export const messageChannels = ["EMAIL", "SMS"] as const;

export const conversationListQuerySchema = z.object({
  status: z.enum(["all", ...conversationStatuses]).optional().default("OPEN"),
  search: z.string().trim().max(120).optional().default(""),
});

export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>;

export const sendMessageSchema = z
  .object({
    channel: z.enum(messageChannels),
    subject: z.string().trim().max(200).optional().default(""),
    body: z.string().trim().min(1, "Write a message first.").max(5_000),
  })
  .superRefine((value, ctx) => {
    if (value.channel === "EMAIL" && value.subject.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["subject"],
        message: "Add a subject for email messages.",
      });
    }
  });

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

/**
 * SMS opt-out / opt-in keywords. Matching is on the first word only, so
 * "STOP please" and "stop." both register. Kept intentionally conservative to
 * align with carrier standard keywords.
 */
export const OPT_OUT_KEYWORDS = [
  "STOP",
  "STOPALL",
  "UNSUBSCRIBE",
  "CANCEL",
  "END",
  "QUIT",
  "OPTOUT",
] as const;

export const OPT_IN_KEYWORDS = ["START", "YES", "UNSTOP", "OPTIN"] as const;

export type OptIntent = "opt_out" | "opt_in" | null;

export function parseOptKeyword(body: string): OptIntent {
  const firstWord = body.trim().split(/\s+/)[0]?.toUpperCase().replace(/[^A-Z]/g, "") ?? "";
  if (!firstWord) {
    return null;
  }
  if ((OPT_OUT_KEYWORDS as readonly string[]).includes(firstWord)) {
    return "opt_out";
  }
  if ((OPT_IN_KEYWORDS as readonly string[]).includes(firstWord)) {
    return "opt_in";
  }
  return null;
}

// Twilio inbound SMS webhook (application/x-www-form-urlencoded).
export const twilioInboundSchema = z.object({
  From: z.string().min(1),
  To: z.string().optional(),
  Body: z.string().optional().default(""),
  MessageSid: z.string().min(1),
});

// Twilio status-callback webhook.
export const twilioStatusSchema = z.object({
  MessageSid: z.string().min(1),
  MessageStatus: z.string().min(1),
});

export type TwilioStatus = z.infer<typeof twilioStatusSchema>;
