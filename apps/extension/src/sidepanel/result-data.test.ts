import { describe, expect, it } from "vitest";
import type { CollectedRow } from "@atlas/shared";
import { filterRecords } from "./ResultDataPanel";
import { failureHint } from "./failure-hints";

const rows: CollectedRow[] = [
  { key: "1", index: 0, data: { title: "电影 Alpha" }, detailStatus: "success" },
  { key: "2", index: 1, data: { title: "新闻 Beta" }, detailStatus: "failed", detailError: "Failed to fetch" },
  { key: "3", index: 2, data: { title: "文章 Gamma" }, detailStatus: "pending" },
];

describe("result filters and actionable errors", () => {
  it("filters data and error text without changing saved records", () => {
    const original = JSON.stringify(rows);
    expect(filterRecords(rows, " beta ", "failed").map((row) => row.key)).toEqual(["2"]);
    expect(filterRecords(rows, "FETCH", "all")).toHaveLength(1);
    expect(filterRecords(rows, "", "pending")).toHaveLength(1);
    expect(JSON.stringify(rows)).toBe(original);
  });
  it("does not claim a network failure has a definite cause", () => {
    expect(failureHint("Failed to fetch")).toContain("可能");
    expect(failureHint("429")).toContain("停止连续重试");
    expect(failureHint("缺少正文")).toContain("修正选择器");
  });
});
