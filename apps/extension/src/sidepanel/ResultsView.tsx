import { CirclePause, CirclePlay, Download, FileJson, FileSpreadsheet, Square } from "lucide-react";
import type { CollectedRow, ExtractionPlan, JobRecord } from "@atlas/shared";
import { ResultDataPanel } from "./ResultDataPanel";
import { statusLabel } from "./job-labels";
import { failureHint } from "./failure-hints";

interface Props {
  job: JobRecord;
  records: CollectedRow[];
  onControl: (action: "pause" | "resume" | "cancel") => void;
  onExport: (format: "csv" | "json" | "xlsx") => void;
  onRetry: () => void;
}

export function ResultsView({ job, records, onControl, onExport, onRetry }: Props) {
  const plan: ExtractionPlan = job.plan;
  const waitSeconds = job.retryAt ? Math.max(0, Math.ceil((job.retryAt - Date.now()) / 1000)) : 0;
  return <>
    <section className="job-hero">
      <div className={`pulse ${job.status}`} /><div><span className="eyebrow">LIVE JOB</span><h2>{statusLabel[job.status]}</h2></div>
      <div className="job-numbers"><b>{job.rowCount}</b><span>ROWS</span><b>{job.page}</b><span>PAGE</span>
        {plan.detail && <><b>{Math.max(0, (job.detailCount ?? 0) - (job.detailFailed ?? 0))}</b><span>详情成功</span></>}</div>
    </section>
    {plan.detail && <p className="detail-progress">列表已保存 {job.rowCount} 条 · 详情成功 {Math.max(0, (job.detailCount ?? 0) - (job.detailFailed ?? 0))} 条 · 失败 {job.detailFailed ?? 0} 条 · 待处理 {job.detailPending ?? 0} 条</p>}
    {plan.detail && ((job.detailFailed ?? 0) > 0 || job.detailError) && <div className="warning-banner">{job.detailFailed ? `${job.detailFailed} 条详情未能完整读取。` : ""}{job.detailError ? ` 最近原因：${job.detailError}` : ""}</div>}
    {job.error && <div className="error-banner">{job.error}</div>}
    {(job.detailError || job.error) && <p className="panel-description">{failureHint(job.detailError ?? job.error ?? "")}</p>}
    <div className="toolbar">
      {job.status === "running" && <button className="outline" onClick={() => onControl("pause")}><CirclePause size={16} />暂停</button>}
      {job.status === "paused" && <button className="primary" disabled={waitSeconds > 0} onClick={() => onControl("resume")}><CirclePlay size={16} />{waitSeconds ? `等待 ${waitSeconds} 秒` : "继续未完成任务"}</button>}
      {["partial", "failed", "completed"].includes(job.status) && !!job.detailFailed && <button className="primary" onClick={onRetry}>仅补采失败详情</button>}
      {["running", "paused"].includes(job.status) && <button className="outline" onClick={() => onControl("cancel")}><Square size={14} />停止</button>}
    </div>
    <ResultDataPanel job={job} records={records} />
    <div className="export-grid">
      <button onClick={() => onExport("csv")}><Download size={16} /><span><b>CSV</b><small>通用表格</small></span></button>
      <button onClick={() => onExport("xlsx")}><FileSpreadsheet size={16} /><span><b>XLSX</b><small>Excel 工作簿</small></span></button>
      <button onClick={() => onExport("json")}><FileJson size={16} /><span><b>JSON</b><small>结构化数据</small></span></button>
    </div>
  </>;
}
