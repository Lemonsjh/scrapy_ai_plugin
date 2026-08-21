// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { redact } from "./snapshot";

describe("snapshot privacy", () => {
  it("redacts email, phone and bearer tokens", () => {
    const output = redact("a@example.com 13800138000 Bearer abcdefghijklmnopqrstuvwxyz");
    expect(output).toContain("[EMAIL]");
    expect(output).toContain("[PHONE]");
    expect(output).toContain("[TOKEN]");
    expect(output).not.toContain("a@example.com");
  });
});
