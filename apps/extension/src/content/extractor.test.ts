// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { ExtractionPlan } from "@atlas/shared";
import { applyTransforms, extractDetailDocument, extractRows } from "./extractor";
import { selectorCandidates } from "./selectors";

const plan: ExtractionPlan = {
  mode: "list", rowSelectors: [".item"],
  fields: [
    { id: "title", name: "标题", selectors: ["h2"], source: "text", required: true, confidence: 1, transforms: [{ type: "trim" }] },
    { id: "price", name: "价格", selectors: [".price"], source: "text", required: true, confidence: 1, transforms: [{ type: "parse_number" }] },
  ],
  pagination: { type: "none" }, filters: [{ fieldId: "price", operator: "gt", value: 100 }],
  limits: { maxPages: 10, maxRows: 1000, maxDurationMs: 600000, delayMs: 1000 }, deduplicateBy: ["title"],
};

describe("deterministic extractor", () => {
  beforeEach(() => {
    document.body.innerHTML = `<main><article class="item"><h2 data-testid="name"> A </h2><b class="price">¥99</b></article>
      <article class="item"><h2 data-testid="name">B</h2><b class="price">1.2万</b></article></main>`;
  });

  it("applies numeric scales and filters", () => expect(extractRows(plan).rows).toEqual([{ title: "B", price: 12000 }]));
  it("normalizes relative URLs", () => expect(applyTransforms("/p/1", [{ type: "absolute_url" }], "https://example.com/a")).toBe("https://example.com/p/1"));
  it("prefers stable semantic attributes", () => expect(selectorCandidates(document.querySelector("h2")!)[0]).toContain("data-testid"));
  it("extracts article text from a fetched detail document", () => {
    const document = new DOMParser().parseFromString("<article><p> 正文内容 </p></article>", "text/html");
    const result = extractDetailDocument(document, {
      linkFieldId: "title", maxItems: 10, delayMs: 0,
      fields: [{ id: "content", name: "正文", selectors: ["article"], source: "text", required: true, confidence: 1, transforms: [{ type: "trim" }] }],
    }, "https://example.com/news/1");
    expect(result).toEqual({ data: { content: "正文内容" }, errors: [] });
  });
});
