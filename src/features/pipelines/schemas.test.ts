import { describe, expect, it } from "vitest";
import {
  boardQuerySchema,
  opportunityInputSchema,
  parseBoardQuery,
  pipelineInputSchema,
  stageInputSchema,
} from "./schemas";

describe("pipelineInputSchema", () => {
  it("rejects an empty name", () => {
    expect(pipelineInputSchema.safeParse({ name: "" }).success).toBe(false);
    expect(pipelineInputSchema.safeParse({ name: "  " }).success).toBe(false);
  });

  it("accepts and trims a name", () => {
    const result = pipelineInputSchema.parse({ name: " Sales pipeline " });
    expect(result.name).toBe("Sales pipeline");
  });
});

describe("stageInputSchema", () => {
  it("defaults missing probability to 0 and checkboxes to false", () => {
    const result = stageInputSchema.parse({ name: "New lead", probability: undefined });
    expect(result.probability).toBe(0);
    expect(result.isWon).toBe(false);
    expect(result.isLost).toBe(false);
  });

  it("parses checkbox strings", () => {
    const result = stageInputSchema.parse({ name: "Closed won", probability: "100", isWon: "on" });
    expect(result.probability).toBe(100);
    expect(result.isWon).toBe(true);
    expect(result.isLost).toBe(false);
  });

  it("rejects probability out of range", () => {
    expect(stageInputSchema.safeParse({ name: "X", probability: 150 }).success).toBe(false);
  });
});

const validOpportunity = {
  pipelineId: "3f8b8c1e-1111-4111-8111-111111111111",
  stageId: "3f8b8c1e-2222-4222-8222-222222222222",
  contactId: "3f8b8c1e-3333-4333-8333-333333333333",
  name: "Widget deal",
  value: "19.99",
  currency: "usd",
};

describe("opportunityInputSchema", () => {
  it("uppercases currency and defaults to USD when blank", () => {
    const parsed = opportunityInputSchema.parse({ ...validOpportunity, currency: "eur" });
    expect(parsed.currency).toBe("EUR");
    const blank = opportunityInputSchema.parse({ ...validOpportunity, currency: "" });
    expect(blank.currency).toBe("USD");
  });

  it("rejects negative values", () => {
    expect(
      opportunityInputSchema.safeParse({ ...validOpportunity, value: "-5" }).success,
    ).toBe(false);
  });

  it("rejects bad dates", () => {
    expect(
      opportunityInputSchema.safeParse({ ...validOpportunity, expectedCloseDate: "not-a-date" }).success,
    ).toBe(false);
    const ok = opportunityInputSchema.parse({ ...validOpportunity, expectedCloseDate: "2026-03-01" });
    expect(ok.expectedCloseDate).not.toBeNull();
  });

  it("passes blank assignee through as null", () => {
    const parsed = opportunityInputSchema.parse({ ...validOpportunity, assignedUserId: "" });
    expect(parsed.assignedUserId).toBeNull();
  });
});

describe("boardQuerySchema / parseBoardQuery", () => {
  it("applies defaults", () => {
    const query = parseBoardQuery({});
    expect(query).toMatchObject({ assignee: "", status: "all", valueMin: 0, closeBefore: "" });
  });

  it("coerces loose search params", () => {
    const query = parseBoardQuery({ status: ["OPEN"], valueMin: ["1000"], closeBefore: ["2026-12-31"] });
    expect(query.status).toBe("OPEN");
    expect(query.valueMin).toBe(1000);
    expect(query.closeBefore).toBe("2026-12-31");
  });

  it("rejects invalid status", () => {
    expect(boardQuerySchema.safeParse({ status: "MAYBE" }).success).toBe(false);
  });
});
