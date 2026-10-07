import { useState } from "react";
import type { FieldRule, RowData } from "@atlas/shared";

export function DataTable({ fields, rows }: { fields: FieldRule[]; rows: RowData[] }) {
  const [expanded, setExpanded] = useState<{ name: string; value: string } | null>(null);
  return <>
    <div className="table-scroll"><table><thead><tr>{fields.map((field) => <th key={field.id}>{field.name}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={index}>{fields.map((field) => {
        const value = row[field.id];
        const text = value == null || value === "" ? "—" : String(value);
        return <td key={field.id}><button className="data-cell" title={text} aria-label={`查看第 ${index + 1} 行${field.name}`} onClick={() => setExpanded({ name: field.name, value: text })}>{text}</button></td>;
      })}</tr>)}</tbody></table></div>
    {expanded && <div className="cell-detail" role="region" aria-label="单元格全文"><div><b>{expanded.name}</b><button className="outline small" onClick={() => setExpanded(null)}>收起</button></div><pre>{expanded.value}</pre></div>}
  </>;
}
