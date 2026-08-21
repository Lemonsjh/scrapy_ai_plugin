import type { ExtensionMessage, JobRecord, RowData } from "@atlas/shared";
import { extractRows, fingerprint } from "./extractor";
import { queryFirst } from "./selectors";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForChange(previous: string, timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (changed: boolean) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      clearTimeout(timeout);
      resolve(changed);
    };
    const observer = new MutationObserver(() => {
      window.setTimeout(() => finish(fingerprint(extractRows(activePlan!).rows) !== previous), 400);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const timeout = window.setTimeout(() => finish(false), timeoutMs);
  });
}

let activePlan: JobRecord["plan"] | null = null;
let cancelled = false;
let paused = false;

async function send(message: ExtensionMessage) {
  return chrome.runtime.sendMessage(message);
}

function limitRows(rows: RowData[], job: JobRecord) {
  return rows.slice(0, Math.max(0, job.plan.limits.maxRows - job.rowCount));
}

export async function runJob(job: JobRecord) {
  activePlan = job.plan;
  cancelled = false;
  paused = false;
  const started = job.startedAt || Date.now();
  let page = Math.max(1, job.page);
  let noChange = 0;
  let lastFingerprint = "";

  try {
    while (!cancelled && page <= job.plan.limits.maxPages && Date.now() - started < job.plan.limits.maxDurationMs) {
      while (paused && !cancelled) await sleep(250);
      const extracted = extractRows(job.plan);
      const currentFingerprint = fingerprint(extracted.rows);
      const rows = limitRows(extracted.rows, job);
      if (rows.length) {
        const result = await send({ type: "JOB_BATCH", jobId: job.id, rows, page });
        job.rowCount = Number(result?.rowCount ?? job.rowCount + rows.length);
      }
      if (job.rowCount >= job.plan.limits.maxRows) break;

      const pagination = job.plan.pagination;
      if (pagination.type === "none") break;
      await sleep(job.plan.limits.delayMs);

      if (pagination.type === "next_button") {
        const button = queryFirst(document, pagination.selectors) as HTMLElement | null;
        if (!button || button.matches(":disabled,[aria-disabled='true']")) break;
        const oldUrl = location.href;
        await send({ type: "JOB_BATCH", jobId: job.id, rows: [], page: page + 1 });
        button.click();
        const changed = await waitForChange(currentFingerprint, Math.max(8_000, job.plan.limits.delayMs * 4));
        if (!changed && location.href === oldUrl) noChange += 1; else noChange = 0;
        if (noChange >= 2) break;
        page += 1;
        continue;
      }

      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      await sleep(pagination.idleMs);
      const nextFingerprint = fingerprint(extractRows(job.plan).rows);
      noChange = nextFingerprint === lastFingerprint || nextFingerprint === currentFingerprint ? noChange + 1 : 0;
      lastFingerprint = nextFingerprint;
      if (noChange >= pagination.maxNoChangeRounds) break;
      page += 1;
    }
    if (!cancelled) await send({ type: "JOB_EVENT", jobId: job.id, status: "completed" });
  } catch (error) {
    await send({ type: "JOB_EVENT", jobId: job.id, status: "failed", error: error instanceof Error ? error.message : "采集失败" });
  } finally {
    activePlan = null;
  }
}

export function controlJob(action: "pause" | "resume" | "cancel") {
  if (action === "pause") paused = true;
  if (action === "resume") paused = false;
  if (action === "cancel") cancelled = true;
}
