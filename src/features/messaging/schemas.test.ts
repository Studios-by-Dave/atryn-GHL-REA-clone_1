import { describe, expect, it } from "vitest";
import {
  conversationListQuerySchema,
  parseOptKeyword,
  sendMessageSchema,
  twilioInboundSchema,
  twilioStatusSchema,
} from "./schemas";

describe("sendMessageSchema", () => {
  it("accepts an SMS message without a subject", () => {
    const parsed = sendMessageSchema.safeParse({ channel: "SMS", body: "Hi there" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.subject).toBe("");
    }
  });

  it("requires a subject for email", () => {
    const parsed = sendMessageSchema.safeParse({ channel: "EMAIL", body: "Body" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.path).toEqual(["subject"]);
    }
  });

  it("accepts an email with a subject", () => {
    expect(
      sendMessageSchema.safeParse({ channel: "EMAIL", subject: "Hello", body: "Body" }).success,
    ).toBe(true);
  });

  it("rejects empty bodies", () => {
    expect(sendMessageSchema.safeParse({ channel: "SMS", body: "   " }).success).toBe(false);
  });

  it("rejects unknown channels", () => {
    expect(sendMessageSchema.safeParse({ channel: "FAX", body: "x" }).success).toBe(false);
  });
});

describe("conversationListQuerySchema", () => {
  it("defaults to OPEN status and empty search", () => {
    const parsed = conversationListQuerySchema.parse({});
    expect(parsed).toEqual({ status: "OPEN", search: "" });
  });

  it("accepts 'all' and a search term", () => {
    expect(conversationListQuerySchema.parse({ status: "all", search: "jane" }).status).toBe("all");
  });
});

describe("parseOptKeyword", () => {
  it("detects opt-out keywords case-insensitively with punctuation", () => {
    expect(parseOptKeyword("STOP")).toBe("opt_out");
    expect(parseOptKeyword("stop.")).toBe("opt_out");
    expect(parseOptKeyword("Unsubscribe please")).toBe("opt_out");
  });

  it("detects opt-in keywords", () => {
    expect(parseOptKeyword("START")).toBe("opt_in");
    expect(parseOptKeyword("yes")).toBe("opt_in");
  });

  it("returns null for ordinary messages", () => {
    expect(parseOptKeyword("Hello, are you open?")).toBeNull();
    expect(parseOptKeyword("")).toBeNull();
  });

  it("only matches the first word", () => {
    expect(parseOptKeyword("please stop")).toBeNull();
  });
});

describe("twilio schemas", () => {
  it("parses an inbound payload with an empty body default", () => {
    const parsed = twilioInboundSchema.parse({ From: "+15551234567", MessageSid: "SM1" });
    expect(parsed.Body).toBe("");
  });

  it("requires MessageSid on status callbacks", () => {
    expect(twilioStatusSchema.safeParse({ MessageStatus: "delivered" }).success).toBe(false);
  });
});
