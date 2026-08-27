import { planFields, type ExtractionPlan, type RowData } from "@atlas/shared";
import * as XLSX from "xlsx";

function mappedRows(rows: RowData[], plan: ExtractionPlan) {
  return rows.map((row) => Object.fromEntries(planFields(plan).map((field) => [field.name, row[field.id] ?? ""])));
}

function csvEscape(value: unknown) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function createExport(rows: RowData[], plan: ExtractionPlan, format: "csv" | "json" | "xlsx") {
  const mapped = mappedRows(rows, plan);
  if (format === "json") {
    const text = JSON.stringify(mapped, null, 2);
    return { url: `data:application/json;charset=utf-8,${encodeURIComponent(text)}`, extension: "json" };
  }
  if (format === "csv") {
    const headers = planFields(plan).map((field) => field.name);
    const lines = [headers.map(csvEscape).join(","), ...mapped.map((row) => headers.map((header) => csvEscape(row[header])).join(","))];
    return { url: `data:text/csv;charset=utf-8,${encodeURIComponent(`\uFEFF${lines.join("\r\n")}`)}`, extension: "csv" };
  }
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(mapped), "采集数据");
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return {
    url: `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${toBase64(new Uint8Array(bytes))}`,
    extension: "xlsx",
  };
}
