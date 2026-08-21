import type { ExtensionMessage, JobRecord, JobStatus } from "@atlas/shared";
import { ExtractionPlanSchema } from "@atlas/shared";
import { addRows, getJob, getLatestJob, getRows, getTabJob, listJobs, putJob } from "./database";
import { createExport } from "./exporter";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => undefined);

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
        const parsed = ExtractionPlanSchema.parse(raw.plan);
        const tabId = sender.tab?.id ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;
        if (tabId === undefined) throw new Error("找不到活动页面");
        const now = Date.now();
        const job: JobRecord = {
          id: crypto.randomUUID(), tabId, url: raw.url, plan: parsed, status: "running",
          page: 1, rowCount: 0, startedAt: now, updatedAt: now,
        };
        await putJob(job);
        await sendToTab(tabId, { type: "RUN_JOB", job });
        return job;
      }
      case "JOB_BATCH": {
        const job = await getJob(raw.jobId);
        if (!job || job.status !== "running") return { rowCount: job?.rowCount ?? 0 };
        job.page = raw.page;
        const updated = await addRows(job, raw.rows);
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
        const job = await setStatus(raw.jobId, "running");
        const sent = await sendToTab(job.tabId, raw);
        if (!sent) await sendToTab(job.tabId, { type: "RUN_JOB", job });
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
