import { describe, expect, it } from "vitest";
import { ExtractionPlanSchema } from "./schemas";

const validPlan = {
  mode: "list",
  rowSelectors: [".card"],
  fields: [{ id: "title", name: "标题", selectors: ["h2"], source: "text", required: true, confidence: 0.9, transforms: [] }],
  pagination: { type: "none" },
  filters: [],
  limits: { maxPages: 10, maxRows: 1000, maxDurationMs: 600000, delayMs: 1000 },
  deduplicateBy: ["title"],
};

describe("ExtractionPlanSchema", () => {
  it("accepts declarative plans", () => expect(ExtractionPlanSchema.safeParse(validPlan).success).toBe(true));
  it("rejects executable selector content", () => {
    const plan = structuredClone(validPlan);
    plan.rowSelectors = ["javascript:alert(1)"];
    expect(ExtractionPlanSchema.safeParse(plan).success).toBe(false);
  });
});
