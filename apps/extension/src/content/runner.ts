import type { DetailItem, ExtensionMessage, JobRecord } from "@atlas/shared";
import { extractRows, fingerprint } from "./extractor";
import { queryFirst } from "./selectors";
import { DetailReadError, readDetail } from "./detail-reader";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
let activeJob: string | null = null;
let cancelled = false;
let paused = false;
let currentJob: JobRecord | null = null;
let controller: AbortController | null = null;

async function send(message: ExtensionMessage) {
  const response = await chrome.runtime.sendMessage(message);
  if (response?.error && !response?.id) throw new Error(response.error);
  return response;
}

async function ready() {
  while (paused && !cancelled) await sleep(100);
  return !cancelled;
}

function waitForChange(plan: JobRecord["plan"], previous: string, timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    let stableTimer = 0;
    const finish = (changed: boolean) => {
      observer.disconnect(); clearTimeout(timer); clearTimeout(stableTimer); resolve(changed);
    };
    const observer = new MutationObserver(() => {
      clearTimeout(stableTimer);
      stableTimer = window.setTimeout(() => {
        if (fingerprint(extractRows(plan).rows) !== previous) finish(true);
      }, 400);
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    const timer = window.setTimeout(() => finish(false), timeoutMs);
  });
}

async function drainDetails(job: JobRecord) {
  if (!job.plan.detail) return true;
  const queue = await send({ type: "GET_PENDING_DETAILS", jobId: job.id }) as DetailItem[];
  for (const item of queue) {
    if (!await ready()) return false;
    if (Date.now() - job.startedAt >= job.plan.limits.maxDurationMs) {
      await send({ type: "JOB_EVENT", jobId: job.id, status: "paused", error: "达到本次运行时间上限，未完成详情已保存，可手动继续。" });
      return false;
    }
    try {
      const result = await readDetail(job.plan.detail, item.row[job.plan.detail.linkFieldId], job.id, controller?.signal, item.pageUrl ?? job.url);
      if (cancelled) return false;
      await send({ type: "SAVE_DETAIL", jobId: job.id, key: item.key, data: result.data, error: result.errors.join("；") || undefined });
    } catch (cause) {
      if (cancelled) return false;
      const error = cause instanceof Error ? cause.message : "详情读取失败";
      const blocked = cause instanceof DetailReadError && cause.blocked;
      await send({ type: "SAVE_DETAIL", jobId: job.id, key: item.key, error, blocked, retryAt: cause instanceof DetailReadError ? cause.retryAt : undefined });
      if (blocked) return false;
    }
    await sleep(Math.max(1500, job.plan.detail.delayMs));
  }
  return ready();
}

export async function runJob(job: JobRecord) {
  if (activeJob) { if (activeJob === job.id) paused = false; return; }
  activeJob = job.id; currentJob = job; controller = new AbortController(); cancelled = false; paused = false;
  let page = Math.max(1, job.page);
  let noChange = 0;
  try {
    if (!await drainDetails(job)) return;
    while (!job.detailOnly && await ready() && page <= job.plan.limits.maxPages) {
      if (Date.now() - job.startedAt >= job.plan.limits.maxDurationMs) {
        await send({ type: "JOB_EVENT", jobId: job.id, status: "paused", error: "达到本次运行时间上限，可手动继续。" }); return;
      }
      const extracted = extractRows(job.plan);
      if (!extracted.rows.length) {
        await send({ type: "JOB_EVENT", jobId: job.id, status: "paused", error: "列表选择器未匹配到内容，请回到规则页重新点选。" }); return;
      }
      const previous = fingerprint(extracted.rows);
      // Save the list first. Detail updates never change the saved row identity.
      const saved = await send({ type: "JOB_BATCH", jobId: job.id, rows: extracted.rows, page, pageUrl: location.href });
      job.rowCount = Number(saved?.rowCount ?? job.rowCount);
      if (!await drainDetails(job)) return;
      if (job.rowCount >= job.plan.limits.maxRows || page >= job.plan.limits.maxPages) break;
      const pagination = job.plan.pagination;
      if (pagination.type === "none") break;
      await sleep(job.plan.limits.delayMs);
      if (!await ready()) return;
      if (pagination.type === "next_button") {
        const button = queryFirst(document, pagination.selectors) as HTMLElement | null;
        if (!button || button.matches(":disabled,[aria-disabled='true']")) break;
        const change = waitForChange(job.plan, previous, 8_000);
        await send({ type: "JOB_BATCH", jobId: job.id, rows: [], page: page + 1 });
        button.click();
        if (!await change) {
          await send({ type: "JOB_BATCH", jobId: job.id, rows: [], page });
          await send({ type: "JOB_EVENT", jobId: job.id, status: "paused", error: "点击下一页后列表未变化，请检查翻页规则。" }); return;
        }
      } else {
        window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
        await sleep(pagination.idleMs);
        noChange = fingerprint(extractRows(job.plan).rows) === previous ? noChange + 1 : 0;
        if (noChange >= pagination.maxNoChangeRounds) break;
      }
      page += 1;
    }
    if (!cancelled && await ready()) {
      const latest = await send({ type: "GET_JOB", jobId: job.id }) as JobRecord;
      if (latest.status === "running") await send({ type: "JOB_EVENT", jobId: job.id, status: latest.detailFailed ? "partial" : "completed" });
    }
  } catch (error) {
    if (!cancelled) await send({ type: "JOB_EVENT", jobId: job.id, status: "failed", error: error instanceof Error ? error.message : "采集失败" });
  } finally { activeJob = null; currentJob = null; controller = null; }
}

export function controlJob(action: "pause" | "resume" | "cancel") {
  if (action === "pause") paused = true;
  if (action === "resume") { paused = false; if (currentJob) currentJob.startedAt = Date.now(); }
  if (action === "cancel") { cancelled = true; controller?.abort(); }
  return { active: activeJob !== null };
}
