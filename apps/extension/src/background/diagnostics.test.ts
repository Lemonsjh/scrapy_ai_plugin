import { describe, expect, it } from "vitest";
import type { JobRecord } from "@atlas/shared";
import { jobDiagnostics } from "./diagnostics";

describe("minimal local diagnostics", () => {
  it("omits rules, query parameters and data, and redacts sensitive error text", () => {
    const job = { id: "job", url: "https://example.com/list?token=private", status: "paused", page: 1, rowCount: 2,
      error: "Failed to fetch https://example.com/doc?apiKey=secret user@example.com 13812345678 Bearer abcdefghijklmnopqrst",
      plan: { fields: [{ id: "password", name: "private field" }], pagination: { type: "none" } }, startedAt: 1, updatedAt: 2 } as JobRecord;
    const result = jobDiagnostics(job); const text = JSON.stringify(result);
    expect(result.site).toBe("example.com");
    expect(text).not.toMatch(/private|secret|password|13812345678|user@example.com|abcdefghijklmnopqrst/);
    expect(result.error).toContain("[TOKEN]"); expect(result.error).toContain("[EMAIL]");
    expect(result).not.toHaveProperty("plan");
  });
});
