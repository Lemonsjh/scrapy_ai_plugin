import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("AI benchmark fixtures", () => {
  it("ships ten declared and readable pages", () => {
    const root = resolve(import.meta.dirname, "fixtures");
    const manifest = JSON.parse(readFileSync(resolve(root, "benchmark.json"), "utf8")) as { file: string; fields: string[] }[];
    expect(manifest).toHaveLength(10);
    for (const item of manifest) {
      expect(item.fields.length).toBeGreaterThan(0);
      expect(existsSync(resolve(root, item.file))).toBe(true);
    }
  });
});
