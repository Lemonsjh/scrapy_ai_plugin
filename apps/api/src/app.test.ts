import { describe, expect, it } from "vitest";
import type { Planner } from "./planner.js";
import { buildApp } from "./app.js";

const requestBody = {
  intent: "采集标题",
  page: { url: "https://example.com/products", title: "Products" },
  snapshot: { version: 1, createdAt: new Date().toISOString(), charCount: 10, redactionCount: 0, truncated: false, candidates: [] },
};

const planner: Planner = async (_request, requestId) => ({
  requestId,
  warnings: [],
  plan: {
    mode: "list", rowSelectors: [".item"],
    fields: [{ id: "title", name: "标题", selectors: ["h2"], source: "text", required: true, confidence: 1, transforms: [{ type: "trim" }] }],
    pagination: { type: "none" }, filters: [],
    limits: { maxPages: 10, maxRows: 1000, maxDurationMs: 600000, delayMs: 1000 }, deduplicateBy: ["title"],
  },
});

describe("AI plan API", () => {
  it("requires a beta token", async () => {
    const app = await buildApp({ planner, accessTokens: ["test-token"], logger: false });
    const response = await app.inject({ method: "POST", url: "/api/ai/plan", payload: requestBody });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns schema-validated plans", async () => {
    const app = await buildApp({ planner, accessTokens: ["test-token"], logger: false });
    const response = await app.inject({ method: "POST", url: "/api/ai/plan", headers: { authorization: "Bearer test-token" }, payload: requestBody });
    expect(response.statusCode).toBe(200);
    expect(response.json().plan.fields[0].name).toBe("标题");
    await app.close();
  });
});
