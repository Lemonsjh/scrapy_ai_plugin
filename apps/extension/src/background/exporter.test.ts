import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import type { ExtractionPlan } from "@atlas/shared";
import { createExport } from "./exporter";

const plan = { fields: [{ id: "title", name: "标题" }], detail: { fields: [{ id: "body", name: "正文" }] } } as ExtractionPlan;
const rows = [{ title: "电影 A", body: "第一段\n第二段" }, { title: "电影 B", body: null }];

describe("complete saved result exports", () => {
  it("includes all saved rows and full multiline text in JSON and CSV", () => {
    const json = createExport(rows, plan, "json");
    expect(JSON.parse(decodeURIComponent(json.url.split(",").slice(1).join(",")))).toEqual([{ 标题: "电影 A", 正文: "第一段\n第二段" }, { 标题: "电影 B", 正文: "" }]);
    const csv = decodeURIComponent(createExport(rows, plan, "csv").url.split(",").slice(1).join(","));
    expect(csv).toContain('"第一段\n第二段"'); expect(csv).toContain("电影 B");
  });
  it("keeps both successful and empty detail rows in the XLSX workbook", () => {
    const output = createExport(rows, plan, "xlsx");
    const book = XLSX.read(output.url.split(",")[1]!, { type: "base64" });
    expect(XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]!]!)).toEqual([{ 标题: "电影 A", 正文: "第一段\n第二段" }, { 标题: "电影 B", 正文: "" }]);
  });
});
