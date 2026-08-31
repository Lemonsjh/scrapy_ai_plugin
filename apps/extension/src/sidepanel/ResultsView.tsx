import { CirclePause, CirclePlay, Download, FileJson, FileSpreadsheet, Square, Table2 } from "lucide-react";
import { planFields, type ExtractionPlan, type JobRecord, type RowData } from "@atlas/shared";

interface Props {
  job: JobRecord;
  rows: RowData[];
  onControl: (action: "pause" | "resume" | "cancel") => void;
  onExport: (format: "csv" | "json" | "xlsx") => void;
}

const statusLabel: Record<JobRecord["status"], string> = {
  idle: "等待", running: "采集中", paused: "已暂停", completed: "已完成", failed: "失败", cancelled: "已取消",
};

export function ResultsView({ job, rows, onControl, onExport }: Props) {
  const plan: ExtractionPlan = job.plan;
  return <>
    <section className="job-hero">
      <div className={`pulse ${job.status}`} /><div><span className="eyebrow">LIVE JOB</span><h2>{statusLabel[job.status]}</h2></div>
      <div className="job-numbers"><b>{job.rowCount}</b><span>ROWS</span><b>{job.page}</b><span>PAGE</span>
        {plan.detail && <><b>{job.detailCount ?? 0}</b><span>DETAIL</span></>}</div>
    </section>
    {plan.detail && (job.detailFailed ?? 0) > 0 && <div className="warning-banner">{job.detailFailed} 篇详情页未能读取，相关字段已保留为空。{job.detailError ? ` 最近原因：${job.detailError}` : ""}</div>}
    {job.error && <div className="error-banner">{job.error}</div>}
    <div className="toolbar">
      {job.status === "running" && <button className="outline" onClick={() => onControl("pause")}><CirclePause size={16} />暂停</button>}
      {job.status === "paused" && <button className="primary" onClick={() => onControl("resume")}><CirclePlay size={16} />继续</button>}
      {["running", "paused"].includes(job.status) && <button className="outline" onClick={() => onControl("cancel")}><Square size={14} />停止</button>}
    </div>
    <section className="data-panel">
      <div className="section-heading compact"><div><span className="eyebrow">DATA GRID</span><h2>采集结果</h2></div><Table2 size={20} /></div>
      <div className="table-scroll">
        <table><thead><tr>{planFields(plan).map((field) => <th key={field.id}>{field.name}</th>)}</tr></thead>
          <tbody>{rows.slice(0, 100).map((row, index) => <tr key={index}>{planFields(plan).map((field) => <td key={field.id}>{String(row[field.id] ?? "—")}</td>)}</tr>)}</tbody>
        </table>
        {!rows.length && <div className="empty-data">等待第一批数据…</div>}
      </div>
      {rows.length > 100 && <small className="table-note">面板显示前 100 行，导出包含全部数据。</small>}
    </section>
    <div className="export-grid">
      <button onClick={() => onExport("csv")}><Download size={16} /><span><b>CSV</b><small>通用表格</small></span></button>
      <button onClick={() => onExport("xlsx")}><FileSpreadsheet size={16} /><span><b>XLSX</b><small>Excel 工作簿</small></span></button>
      <button onClick={() => onExport("json")}><FileJson size={16} /><span><b>JSON</b><small>结构化数据</small></span></button>
    </div>
  </>;
}
