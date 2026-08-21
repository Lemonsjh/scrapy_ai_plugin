import { describe, expect, it } from "vitest";
import { AI_SYSTEM_INSTRUCTIONS } from "./ai-contract.js";

describe("AI planner contract", () => {
  it("explicitly requests JSON output for json_object compatible providers", () => {
    expect(AI_SYSTEM_INSTRUCTIONS).toMatch(/json/i);
    expect(AI_SYSTEM_INSTRUCTIONS).toContain("符合 Schema 的 JSON 对象");
  });
});
