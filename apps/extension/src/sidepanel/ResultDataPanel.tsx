import { useEffect, useState } from "react";
import { Table2 } from "lucide-react";
import { planFields, type CollectedRow, type JobRecord } from "@atlas/shared";
import { DataTable } from "./DataTable";

export function filterRecords(records: CollectedRow[], query: string, status: string) {
  const needle = query.trim().toLowerCase();
  return records.filter((row) => (status === "all" || row.detailStatus === status)
    && `${Object.values(row.data).join(" ")} ${row.detailError ?? ""}`.toLowerCase().includes(needle));
}

export function ResultDataPanel({ job, records }: { job: JobRecord; records: CollectedRow[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  useEffect(() => { setQuery(""); setStatus("all"); setPage(0); }, [job.id]);
  const filtered = filterRecords(records, query, status);
  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  const currentPage = Math.min(page, pages - 1);
  const displayed = filtered.slice(currentPage * 50, (currentPage + 1) * 50);
  return <section className="data-panel">
    <div className="section-heading compact"><div><span className="eyebrow">DATA GRID</span><h2>采集结果</h2></div><Table2 size={20} /></div>
    <div className="result-filters"><input aria-label="搜索采集结果" placeholder="搜索内容或错误" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
      {job.plan.detail && <select aria-label="筛选详情状态" value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }}>
        <option value="all">全部记录</option><option value="success">详情成功</option><option value="failed">详情失败</option><option value="pending">待处理</option>
      </select>}</div>
    <DataTable key={`${job.id}:${currentPage}:${query}:${status}`} fields={planFields(job.plan)} rows={displayed.map((row) => row.data)} records={job.plan.detail ? displayed : undefined} />
    {!filtered.length && <p className="empty-data">{records.length ? "没有符合条件的记录" : job.status === "running" ? "等待第一批数据…" : job.rowCount ? "正在读取本地结果…" : "此任务没有保存数据"}</p>}
    <div className="result-pagination"><button className="outline small" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>上一组</button><span>{currentPage + 1} / {pages} · {filtered.length} 条</span><button className="outline small" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)}>下一组</button></div>
    <small className="table-note">每组显示 50 条；筛选仅影响显示，导出始终包含全部结果。</small>
  </section>;
}
