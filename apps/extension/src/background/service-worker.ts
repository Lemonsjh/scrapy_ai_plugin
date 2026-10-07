import type { ExtensionMessage, JobRecord, JobStatus } from "@atlas/shared";
import { ExtractionPlanSchema } from "@atlas/shared";
import { addRows, getJob, getLatestJob, getRows, getTabJob, listJobs, putJob, pendingDetails, saveDetail, retryDetails } from "./database";
import { createExport } from "./exporter";
import { isSameSite, retryTime } from "../detail-site";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);

function planError(issues: { path: PropertyKey[]; message: string }[]) {
  const issue = issues[0];
  const path = issue?.path.length ? issue.path.join(" › ") : "根规则";
  return `规则配置无效（${path}）：${issue?.message ?? "未知原因"}`;
}

async function injectCollector(tabId: number) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return true;
  } catch {
    return false;
  }
}

async function sendToTab(tabId: number, message: ExtensionMessage) {
  try { return await chrome.tabs.sendMessage(tabId, message); } catch { return null; }
}

async function setStatus(jobId: string, status: JobStatus, error?: string) {
  const job = await getJob(jobId);
  if (!job) throw new Error("任务不存在");
  if (["completed", "partial", "failed"].includes(status) && job.status !== "running") return job;
  job.status = status;
  job.updatedAt = Date.now();
  job.error = error;
  await putJob(job);
  return job;
}

chrome.runtime.onMessage.addListener((raw: ExtensionMessage, sender, respond) => {
  void (async () => {
    switch (raw.type) {
      case "START_JOB": {
        const checked = ExtractionPlanSchema.safeParse(raw.plan);
        if (!checked.success) throw new Error(planError(checked.error.issues));
        const parsed = checked.data;
        const tabId = sender.tab?.id ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
        if (tabId === undefined) throw new Error("找不到活动页面");
        const existing = await getTabJob(tabId);
        if (existing && ["running", "paused"].includes(existing.status)) throw new Error("当前页面已有未结束任务，请先停止或继续原任务");
        if (!await injectCollector(tabId)) throw new Error("无法连接当前页面，请刷新网页后重试");
        const now = Date.now();
        const job: JobRecord = {
          id: crypto.randomUUID(), tabId, url: raw.url, plan: parsed, status: "running",
          page: 1, rowCount: 0, detailCount: 0, detailFailed: 0, detailError: undefined, startedAt: now, updatedAt: now,
        };
        await putJob(job);
        if (!await sendToTab(tabId, { type: "RUN_JOB", job })) {
          await setStatus(job.id, "failed", "采集器未连接");
          throw new Error("采集器未连接，请刷新网页后重新开始");
        }
        return job;
      }
      case "FETCH_DETAIL": {
        const job = raw.jobId ? await getJob(raw.jobId) : undefined;
        const pageUrl = job?.url ?? sender.tab?.url;
        if (!pageUrl || !/^https?:$/.test(new URL(raw.url).protocol) || !isSameSite(pageUrl, raw.url)) throw new Error("详情链接不在当前网站");
        const response = await fetch(raw.url, { credentials: "include", signal: AbortSignal.timeout(15_000) });
        if (!response.ok) return { error: `详情页返回 ${response.status}`, status: response.status, retryAt: retryTime(response.headers.get("retry-after")) };
        return { html: await response.text(), url: response.url };
      }
      case "GET_PENDING_DETAILS": return pendingDetails(raw.jobId);
      case "SAVE_DETAIL": return saveDetail(raw.jobId, raw.key, raw.data, raw.error, raw.blocked, raw.retryAt);
      case "JOB_BATCH": {
        const job = await getJob(raw.jobId);
        if (!job || job.status !== "running") return { rowCount: job?.rowCount ?? 0 };
        job.page = raw.page;
        const updated = await addRows(job, raw.rows, raw.pageUrl);
        chrome.runtime.sendMessage({ type: "JOB_EVENT", jobId: job.id, status: updated.status }).catch(() => undefined);
        return { rowCount: updated.rowCount };
      }
      case "JOB_EVENT": return setStatus(raw.jobId, raw.status, raw.error);
      case "GET_JOB": return raw.jobId ? getJob(raw.jobId) : getLatestJob();
      case "GET_ROWS": return getRows(raw.jobId);
      case "PAUSE_JOB": {
        const job = await setStatus(raw.jobId, "paused");
        await sendToTab(job.tabId, raw);
        return job;
      }
      case "RESUME_JOB": {
        const stored = await getJob(raw.jobId);
        if (!stored || stored.status !== "paused") throw new Error("仅暂停任务可以继续");
        if (stored.retryAt && stored.retryAt > Date.now()) throw new Error("网站要求的等待时间尚未结束，请稍后继续");
        const job = await setStatus(raw.jobId, "running");
        job.startedAt = Date.now(); job.retryAt = undefined; await putJob(job);
        const sent = await sendToTab(job.tabId, raw);
        if (!sent?.active) {
          if (!await injectCollector(job.tabId) || !await sendToTab(job.tabId, { type: "RUN_JOB", job })) return setStatus(job.id, "paused", "采集页面不可用，请打开原页面后继续");
        }
        return job;
      }
      case "RETRY_DETAILS": {
        const job = await retryDetails(raw.jobId);
        if (!await injectCollector(job.tabId) || !await sendToTab(job.tabId, { type: "RUN_JOB", job })) return setStatus(job.id, "paused", "采集页面不可用，请打开原页面后继续");
        return job;
      }
      case "CANCEL_JOB": {
        const job = await setStatus(raw.jobId, "cancelled");
        await sendToTab(job.tabId, raw);
        return job;
      }
      case "CONTENT_READY": {
        if (sender.tab?.id === undefined) return null;
        const job = await getTabJob(sender.tab.id);
        if (job?.status === "running") await sendToTab(sender.tab.id, { type: "RUN_JOB", job });
        return job;
      }
      case "EXPORT_ROWS": {
        const job = await getJob(raw.jobId);
        if (!job) throw new Error("任务不存在");
        const rows = await getRows(raw.jobId);
        const output = createExport(rows, job.plan, raw.format);
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        return chrome.downloads.download({ url: output.url, filename: `atlas-${stamp}.${output.extension}`, saveAs: true });
      }
      case "GET_DIAGNOSTICS": {
        const jobs = await listJobs();
        return { version: chrome.runtime.getManifest().version, generatedAt: new Date().toISOString(), jobs };
      }
      default: return undefined;
    }
  })().then(respond).catch((error) => respond({ error: error instanceof Error ? error.message : "未知错误" }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.status !== "complete") return;
  void getTabJob(tabId).then(async (job) => {
    if (job?.status !== "running") return;
    if (new URL(job.url).origin !== new URL(change.url ?? job.url).origin) return;
    if (await injectCollector(tabId)) await sendToTab(tabId, { type: "RUN_JOB", job });
  }).catch(() => undefined);
});
