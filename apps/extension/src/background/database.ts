import type { JobRecord, RowData } from "@atlas/shared";
import { openDB, type DBSchema } from "idb";

interface StoredRow {
  key: string;
  jobId: string;
  index: number;
  data: RowData;
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
  const selected = keys.length ? keys.map((key) => row[key]) : Object.entries(row).sort(([a], [b]) => a.localeCompare(b));
  const input = JSON.stringify(selected);
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) hash = (hash * 33) ^ input.charCodeAt(index);
  return (hash >>> 0).toString(36);
}

export async function putJob(job: JobRecord) {
  await (await database).put("jobs", job);
  return job;
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

export async function addRows(job: JobRecord, rows: RowData[]) {
  const db = await database;
  const transaction = db.transaction(["jobs", "rows"], "readwrite");
  let added = 0;
  for (const row of rows) {
    const hash = stableHash(row, job.plan.deduplicateBy);
    const key = `${job.id}:${hash}`;
    if (await transaction.objectStore("rows").getKey(key)) continue;
    await transaction.objectStore("rows").put({ key, jobId: job.id, index: job.rowCount + added, data: row });
    added += 1;
  }
  job.rowCount += added;
  job.updatedAt = Date.now();
  await transaction.objectStore("jobs").put(job);
  await transaction.done;
  return job;
}

export async function getRows(jobId: string) {
  const rows = await (await database).getAllFromIndex("rows", "by-job", jobId);
  return rows.sort((a, b) => a.index - b.index).map((row) => row.data);
}

export async function listJobs() {
  return (await database).getAll("jobs");
}
