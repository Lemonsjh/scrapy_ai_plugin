// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { isNextPageLabel, redact } from "./snapshot";

describe("snapshot privacy", () => {
  it("redacts email, phone and bearer tokens", () => {
    const output = redact("a@example.com 13800138000 Bearer abcdefghijklmnopqrstuvwxyz");
    expect(output).toContain("[EMAIL]");
    expect(output).toContain("[PHONE]");
    expect(output).toContain("[TOKEN]");
    expect(output).not.toContain("a@example.com");
  });
  it("recognizes common next-page labels", () => {
    expect(["后页>", "下一页", "Next ›", ">"].every(isNextPageLabel)).toBe(true);
    expect(isNextPageLabel("前页")).toBe(false);
  });
});
