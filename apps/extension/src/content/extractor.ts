import type { ExtractionPlan, FieldRule, RowData, TransformRule } from "@atlas/shared";
import { queryAllFirst, queryFirst } from "./selectors";

function sourceValue(element: Element, field: FieldRule) {
  if (field.source === "html") return element.innerHTML;
  if (field.source === "href") return element.getAttribute("href") ?? "";
  if (field.source === "src") return element.getAttribute("src") ?? "";
  if (field.source === "attribute") return element.getAttribute(field.attribute ?? "") ?? "";
  return element.textContent ?? "";
}

export function applyTransforms(value: string, transforms: TransformRule[], baseUrl = location.href): string | number | null {
  let current: string | number | null = value;
  for (const transform of transforms) {
    const text: string = current === null ? "" : String(current);
    switch (transform.type) {
      case "trim": current = text.trim(); break;
      case "replace": current = text.split(transform.search).join(transform.replacement); break;
      case "regex_extract": {
        try { current = new RegExp(transform.pattern).exec(text)?.[transform.group] ?? ""; } catch { current = ""; }
        break;
      }
      case "parse_number": {
        const scale = /万/.test(text) ? 10_000 : /亿/.test(text) ? 100_000_000 : 1;
        const parsed = Number(text.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/)?.[0]);
        current = Number.isFinite(parsed) ? parsed * scale : null;
        break;
      }
      case "parse_date": {
        const parsed = Date.parse(text);
        current = Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
        break;
      }
      case "absolute_url": {
        try { current = new URL(text, baseUrl).href; } catch { current = text; }
        break;
      }
      case "fallback": if (!text) current = transform.value; break;
    }
  }
  return typeof current === "string" ? current.trim() : current;
}

export function extractRows(plan: ExtractionPlan) {
  const rowElements = queryAllFirst(document, plan.rowSelectors);
  const errors: string[] = [];
  const rows = rowElements.map((row, rowIndex) => {
    const data: RowData = {};
    for (const field of plan.fields) {
      const element = queryFirst(row, field.selectors);
      if (!element) {
        data[field.id] = null;
        if (field.required) errors.push(`第 ${rowIndex + 1} 行缺少“${field.name}”`);
        continue;
      }
      data[field.id] = applyTransforms(sourceValue(element, field), field.transforms);
    }
    return data;
  }).filter((row) => plan.filters.every((filter) => {
    const actual = row[filter.fieldId];
    const expected = filter.value;
    if (filter.operator === "contains") return String(actual ?? "").includes(String(expected));
    if (filter.operator === "regex") {
      try { return new RegExp(String(expected)).test(String(actual ?? "")); } catch { return false; }
    }
    if (filter.operator === "eq") return String(actual) === String(expected);
    if (filter.operator === "ne") return String(actual) !== String(expected);
    const left = Number(actual); const right = Number(expected);
    if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
    if (filter.operator === "gt") return left > right;
    if (filter.operator === "gte") return left >= right;
    if (filter.operator === "lt") return left < right;
    return left <= right;
  }));
  return { rows, errors };
}

export function previewPlan(plan: ExtractionPlan) {
  const extracted = extractRows(plan);
  const rows = extracted.rows.slice(0, 5);
  const rowElements = queryAllFirst(document, plan.rowSelectors);
  const matches = plan.fields.map((field) => ({
    fieldId: field.id,
    count: rowElements.filter((row) => queryFirst(row, field.selectors)).length,
  }));
  return { ...extracted, rows, matches };
}

export function fingerprint(rows: RowData[]) {
  const input = JSON.stringify(rows);
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
