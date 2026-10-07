import type { CollectedRow, DetailItem, JobRecord, RowData } from "@atlas/shared";
import { openDB, type DBSchema } from "idb";

interface StoredRow extends CollectedRow {
  jobId: string;
}

interface AtlasDB extends DBSchema {
  jobs: { key: string; value: JobRecord; indexes: { "by-updated": number; "by-tab": number } };
  rows: { key: string; value: StoredRow; indexes: { "by-job": string } };
}

const database = openDB<AtlasDB>("atlas-collector", 1, {
  upgrade(db) {
    const jobs = db.createObjectStore("jobs", { keyPath: "id" });
    jobs.createIndex("by-updated", "updatedAt");
    jobs.createIndex("by-tab", "tabId");
    const rows = db.createObjectStore("rows", { keyPath: "key" });
    rows.createIndex("by-job", "jobId");
  },
});

function stableHash(row: RowData, keys: string[]) {
  const requested = keys.map((key) => row[key]);
  const empty = requested.every((value) => value == null || String(value).trim() === "");
  const selected = keys.length && !empty ? requested : Object.entries(row).sort(([a], [b]) => a.localeCompare(b));
  const input = JSON.stringify(selected);
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) hash = (hash * 33) ^ input.charCodeAt(index);
  return (hash >>> 0).toString(36);
}

export async function putJob(job: JobRecord) {
  await (await database).put("jobs", job);
  return job;
}

export async function activateJob(job: JobRecord, expectedStatus?: JobRecord["status"]) {
  const tx = (await database).transaction("jobs", "readwrite");
  const existing = await tx.store.get(job.id);
  if (expectedStatus && existing?.status !== expectedStatus) throw new Error("任务状态已变化，请刷新任务后重试");
  const jobs = await tx.store.index("by-tab").getAll(job.tabId);
  if (jobs.some((item) => item.id !== job.id && ["running", "paused"].includes(item.status))) throw new Error("该标签页已有未结束任务，请先停止或继续原任务");
  await tx.store.put(job); await tx.done; return job;
}

export async function getJob(id: string) {
  return (await database).get("jobs", id);
}

export async function getLatestJob() {
  const db = await database;
  const cursor = await db.transaction("jobs").store.index("by-updated").openCursor(null, "prev");
  return cursor?.value;
}

export async function getTabJob(tabId: number) {
  const jobs = await (await database).getAllFromIndex("jobs", "by-tab", tabId);
  return jobs.sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

export async function getActiveTabJob(tabId: number, excluding?: string) {
  const jobs = await (await database).getAllFromIndex("jobs", "by-tab", tabId);
  return jobs.filter((job) => job.id !== excluding && ["running", "paused"].includes(job.status)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
}

export async function addRows(job: JobRecord, rows: RowData[], pageUrl = job.url) {
  const db = await database;
  const transaction = db.transaction(["jobs", "rows"], "readwrite");
  const current = await transaction.objectStore("jobs").get(job.id);
  if (!current || current.status !== "running") { await transaction.done; return current ?? job; }
  current.page = job.page;
  let added = 0;
  for (const row of rows) {
    const hash = stableHash(row, job.plan.deduplicateBy);
    const key = `${job.id}:${hash}`;
    if (await transaction.objectStore("rows").getKey(key)) continue;
    const index = current.rowCount + added;
    if (index >= current.plan.limits.maxRows) break;
    const pending = !!current.plan.detail && index < current.plan.detail.maxItems;
    await transaction.objectStore("rows").put({ key, jobId: job.id, index, data: row, pageUrl, detailStatus: pending ? "pending" : undefined });
    if (pending) current.detailPending = (current.detailPending ?? 0) + 1;
    added += 1;
  }
  current.rowCount += added;
  current.updatedAt = Date.now();
  await transaction.objectStore("jobs").put(current);
  await transaction.done;
  return current;
}

export async function pendingDetails(jobId: string): Promise<DetailItem[]> {
  const rows = await (await database).getAllFromIndex("rows", "by-job", jobId);
  return rows.filter((row) => row.detailStatus === "pending").sort((a, b) => a.index - b.index)
    .map((row) => ({ key: row.key, row: row.data, pageUrl: row.pageUrl }));
}

export async function saveDetail(jobId: string, key: string, data?: RowData, error?: string, blocked = false, retryAt?: number) {
  const tx = (await database).transaction(["jobs", "rows"], "readwrite");
  const job = await tx.objectStore("jobs").get(jobId);
  const row = await tx.objectStore("rows").get(key);
  if (!job || !row || row.jobId !== jobId) throw new Error("详情进度不存在");
  if (row.detailStatus !== "pending" || job.status === "cancelled") { await tx.done; return job; }
  row.detailError = error;
  if (!blocked) {
    row.detailStatus = error ? "failed" : "success";
    row.data = { ...row.data, ...data };
    job.detailPending = Math.max(0, (job.detailPending ?? 1) - 1);
    job.detailCount = (job.detailCount ?? 0) + 1;
    if (error) job.detailFailed = (job.detailFailed ?? 0) + 1;
  } else {
    job.status = "paused";
    job.retryAt = retryAt;
    job.error = "网站限制访问，任务已暂停。列表已保存，请等待后手动继续。";
  }
  if (error) job.detailError = error;
  else if (!job.detailFailed) job.detailError = undefined;
  job.updatedAt = Date.now();
  await tx.objectStore("rows").put(row);
  await tx.objectStore("jobs").put(job);
  await tx.done;
  return job;
}

export async function retryDetails(jobId: string) {
  const tx = (await database).transaction(["jobs", "rows"], "readwrite");
  const job = await tx.objectStore("jobs").get(jobId);
  if (!job || !["partial", "completed", "failed"].includes(job.status)) throw new Error("请在任务结束后补采失败详情");
  const siblings = await tx.objectStore("jobs").index("by-tab").getAll(job.tabId);
  if (siblings.some((item) => item.id !== job.id && ["running", "paused"].includes(item.status))) throw new Error("该标签页已有未结束任务，请先停止或完成该任务");
  const rows = await tx.objectStore("rows").index("by-job").getAll(jobId);
  let reset = 0;
  for (const row of rows) if (row.detailStatus === "failed") {
    row.detailStatus = "pending"; row.detailError = undefined; reset += 1;
    await tx.objectStore("rows").put(row);
  }
  job.detailPending = (job.detailPending ?? 0) + reset;
  job.detailCount = Math.max(0, (job.detailCount ?? 0) - reset);
  job.detailFailed = 0; job.detailError = undefined; job.error = undefined;
  job.detailOnly = true; job.status = "running"; job.startedAt = Date.now(); job.updatedAt = Date.now();
  await tx.objectStore("jobs").put(job); await tx.done;
  return job;
}

export async function getRows(jobId: string) {
  const rows = await (await database).getAllFromIndex("rows", "by-job", jobId);
  return rows.sort((a, b) => a.index - b.index).map((row) => row.data);
}

export async function getRowRecords(jobId: string): Promise<CollectedRow[]> {
  const rows = await (await database).getAllFromIndex("rows", "by-job", jobId);
  return rows.sort((a, b) => a.index - b.index).map(({ jobId: _jobId, ...row }) => row);
}

export async function recentJobs() {
  const store = (await database).transaction("jobs").store.index("by-updated");
  let cursor = await store.openCursor(null, "prev");
  const jobs: JobRecord[] = [];
  while (cursor && jobs.length < 50) { jobs.push(cursor.value); cursor = await cursor.continue(); }
  return jobs;
}

export async function listJobs() {
  return (await database).getAll("jobs");
}
