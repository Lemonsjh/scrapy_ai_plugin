import type { DetailPreviewResponse, ExtractionPlan, RowData } from "@atlas/shared";
import { DataTable } from "./DataTable";

interface Props {
  plan: ExtractionPlan;
  rows: RowData[];
  errors: string[];
  trial?: DetailPreviewResponse;
  trialError: string | null;
  busy: boolean;
  onTrial: () => void;
}

export function PreviewPanel({ plan, rows, errors, trial, trialError, busy, onTrial }: Props) {
  return <section className="data-panel preview-panel" aria-label="采集前预览">
    <div className="section-heading compact"><div><span className="eyebrow">LIVE PREVIEW</span><h2>先看看会采到什么</h2></div><span className="trace-tag">本地预览</span></div>
    <p className="panel-description">当前列表的前 {rows.length} 行。点击单元格可查看完整内容。</p>
    {rows.length ? <DataTable fields={plan.fields} rows={rows} /> : <p className="empty-data">尚未匹配到列表，请重新点选。</p>}
    <div className="preview-quality">{plan.fields.map((field) => {
      const missing = rows.filter((row) => row[field.id] == null || row[field.id] === "").length;
      return <span key={field.id} className={missing ? "bad-text" : "good-text"}>{field.name}：{missing}/{rows.length} 空值</span>;
    })}</div>
    {!!errors.length && <div className="warning-banner">{errors.slice(0, 3).join("；")}{errors.length > 3 ? `（共 ${errors.length} 项）` : ""}</div>}
    {plan.detail && <div className="detail-trial"><b>详情先试读一条</b><p>确认内容正确后再批量采集。失败时可以修改选择器，或关闭详情采集。</p>
      <button className="outline" disabled={busy || !rows.length} onClick={onTrial}>{busy ? "正在试读…" : trial ? "重新试读第一条详情" : "试读第一条详情"}</button>
      {trialError && <div className="error-banner" role="alert">{trialError}</div>}
      {trial && <><p className="good-text">试读成功</p><small className="trial-url">{trial.url}</small><DataTable fields={plan.detail.fields} rows={[trial.data]} /></>}
    </div>}
  </section>;
}
