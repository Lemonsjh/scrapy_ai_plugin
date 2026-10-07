import { Clock3, RefreshCw, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { JobRecord } from "@atlas/shared";
import { runtimeMessage } from "./extension-api";
import { siteLabel, statusLabel } from "./job-labels";

interface Props {
  onClose: () => void;
  onOpen: (job: JobRecord) => void;
  onReuse: (job: JobRecord) => Promise<void>;
}

export function HistoryPanel({ onClose, onOpen, onReuse }: Props) {
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = async () => {
    setLoading(true); setError(null);
    try { setJobs(await runtimeMessage<JobRecord[]>({ type: "LIST_JOBS" })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "读取历史失败"); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", listener); return () => document.removeEventListener("keydown", listener);
  }, [onClose]);
  const filtered = jobs.filter((job) => (status === "all" || job.status === status)
    && `${job.url} ${job.plan.fields.map((field) => field.name).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="history-panel" aria-label="任务历史">
    <div className="section-heading"><div><span className="eyebrow">LOCAL ARCHIVE</span><h2><Clock3 size={19} />任务历史</h2></div>
      <div className="toolbar"><button className="icon-button" disabled={loading} aria-label="刷新历史" onClick={() => void refresh()}><RefreshCw size={16} /></button><button className="icon-button" autoFocus aria-label="关闭历史" onClick={onClose}><X size={17} /></button></div></div>
    <p className="panel-description">最近 50 个任务保存在本机。查看结果不会访问原网站；继续任务仍需要原标签页。</p>
    <div className="result-filters"><input aria-label="搜索任务" placeholder="搜索网站或字段名称" value={query} onChange={(event) => setQuery(event.target.value)} />
      <select aria-label="任务状态" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部状态</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    {loading ? <p className="empty-data" role="status">读取本地历史…</p> : filtered.length === 0 ? <p className="empty-data">{jobs.length ? "没有符合条件的任务" : "还没有采集记录"}</p> : <div className="history-list">{filtered.map((job) => <article className="history-item" key={job.id}>
      <div className="history-title"><b>{siteLabel(job.url)}</b><span className={`history-status ${job.status}`}>{statusLabel[job.status]}</span></div>
      <small className="history-url" title={job.url}>{job.url}</small>
      <p>{job.plan.fields.map((field) => field.name).join(" · ")}</p>
      <small>{new Date(job.updatedAt).toLocaleString("zh-CN")} · {job.rowCount} 条 · {job.page} 页</small>
      <div className="toolbar"><button className="primary small" disabled={loading} onClick={() => onOpen(job)}>查看结果</button><button className="outline small" disabled={loading} onClick={() => {
        setLoading(true); void onReuse(job).catch((cause) => setError(cause instanceof Error ? cause.message : "复用失败")).finally(() => setLoading(false));
      }}>在当前页复用规则</button></div>
    </article>)}</div>}
  </section>;
}
