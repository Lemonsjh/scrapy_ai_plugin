import { useState } from "react";
import type { CollectedRow, FieldRule, RowData } from "@atlas/shared";
import { failureHint } from "./failure-hints";

export function DataTable({ fields, rows, records }: { fields: FieldRule[]; rows: RowData[]; records?: CollectedRow[] }) {
  const [expanded, setExpanded] = useState<{ name: string; value: string } | null>(null);
  return <>
    <div className="table-scroll"><table><thead><tr>{records && <th>详情状态</th>}{fields.map((field) => <th key={field.id}>{field.name}</th>)}</tr></thead>
      <tbody>{rows.map((row, index) => <tr key={records?.[index]?.key ?? index}>{records && <td><button className={`row-status ${records[index]?.detailStatus ?? "none"}`} onClick={() => {
        const record = records[index];
        const reason = record?.detailError;
        setExpanded({ name: `第 ${(record?.index ?? index) + 1} 条详情`, value: reason ? `${reason}\n\n建议：${failureHint(reason)}\n\n来源页：${record?.pageUrl ?? "未记录"}` : record?.detailStatus === "success" ? "详情已保存，点击内容单元格可查看全文。" : record?.detailStatus === "pending" ? "尚未完成，继续原任务后将从待处理记录恢复。" : "本条不在详情数量上限内，或来自旧版本任务。列表数据已保存。" });
      }}>{records[index]?.detailError && records[index]?.detailStatus === "pending" ? "待重试" : records[index]?.detailStatus === "success" ? "成功" : records[index]?.detailStatus === "failed" ? "失败 · 原因" : records[index]?.detailStatus === "pending" ? "待处理" : "未安排"}</button></td>}{fields.map((field) => {
        const value = row[field.id];
        const text = value == null || value === "" ? "—" : String(value);
        return <td key={field.id}><button className="data-cell" title={text} aria-label={`查看第 ${(records?.[index]?.index ?? index) + 1} 行${field.name}`} onClick={() => setExpanded({ name: field.name, value: text })}>{text}</button></td>;
      })}</tr>)}</tbody></table></div>
    {expanded && <div className="cell-detail" role="region" aria-label="单元格全文"><div><b>{expanded.name}</b><button className="outline small" onClick={() => setExpanded(null)}>收起</button></div><pre>{expanded.value}</pre></div>}
  </>;
}
