import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { JobRecord } from "@atlas/shared";
import { addRows, getJob, getRows, pendingDetails, putJob, retryDetails, saveDetail, getRowRecords, getTabJob, recentJobs, getActiveTabJob, activateJob } from "./database";

let nextTabId = 1000;

function newJob(): JobRecord {
  return { id: crypto.randomUUID(), tabId: nextTabId++, url: "https://example.com/", status: "running", page: 1,
    rowCount: 0, startedAt: Date.now(), updatedAt: Date.now(), plan: {
      mode: "list", rowSelectors: ["li"], fields: [{ id: "link", name: "链接", source: "href", selectors: ["a"], required: true, confidence: 1, transforms: [] }],
      limits: { maxRows: 10, maxPages: 1, delayMs: 0, maxDurationMs: 600000 }, filters: [], deduplicateBy: [], pagination: { type: "none" },
      detail: { linkFieldId: "link", delayMs: 2000, maxItems: 2, fields: [{ id: "body", name: "内容", selectors: ["article"], source: "text", required: true, confidence: 1, transforms: [] }] },
    } };
}

describe("saved detail checkpoints", () => {
  it("atomically prevents two simultaneous starts for the same tab", async () => {
    const first = { ...newJob(), tabId: 20000 }; const second = { ...newJob(), tabId: 20000 };
    const results = await Promise.allSettled([activateJob(first), activateJob(second)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
  it("finds an unfinished task even if a newer historical task on that tab is completed", async () => {
    const paused = { ...newJob(), tabId: 111, status: "paused" as const, updatedAt: 300 };
    const completed = { ...newJob(), tabId: 111, status: "completed" as const, updatedAt: 400 };
    await putJob(paused); await putJob(completed);
    expect((await getActiveTabJob(111))?.id).toBe(paused.id);
    expect(await getActiveTabJob(111, paused.id)).toBeUndefined();
  });
  it("returns per-row status and errors without losing original export data", async () => {
    const job = newJob(); await putJob(job); await addRows(job, [{ link: "/1" }, { link: "/2" }, { link: "/3" }]);
    const queue = await pendingDetails(job.id);
    await saveDetail(job.id, queue[0]!.key, { body: "正文" });
    await saveDetail(job.id, queue[1]!.key, undefined, "缺少正文");
    const records = await getRowRecords(job.id);
    expect(records.map((row) => row.detailStatus)).toEqual(["success", "failed", undefined]);
    expect(records[1]?.detailError).toBe("缺少正文"); expect(records[0]?.pageUrl).toBe(job.url);
    expect(await getRows(job.id)).toEqual(records.map((row) => row.data));
  });
  it("restores the latest task for its tab even when another tab has a newer task", async () => {
    const first = { ...newJob(), tabId: 77, updatedAt: 100 };
    const second = { ...newJob(), tabId: 88, updatedAt: 200 };
    await putJob(first); await putJob(second);
    expect((await getTabJob(77))?.id).toBe(first.id);
    const history = await recentJobs();
    expect(history.findIndex((job) => job.id === second.id)).toBeLessThan(history.findIndex((job) => job.id === first.id));
  });
  it("persists the list first and updates details in place without changing dedup identity", async () => {
    const job = newJob(); await putJob(job);
    await addRows(job, [{ link: "/1" }, { link: "/2" }, { link: "/3" }]);
    const queue = await pendingDetails(job.id); expect(queue).toHaveLength(2);
    await saveDetail(job.id, queue[0]!.key, { body: "正文" });
    await saveDetail(job.id, queue[0]!.key, { body: "重复写入" });
    const latest = (await getJob(job.id))!;
    await addRows(latest, [{ link: "/1" }, { link: "/2" }]);
    expect(await getRows(job.id)).toEqual([{ link: "/1", body: "正文" }, { link: "/2" }, { link: "/3" }]);
    expect(await pendingDetails(job.id)).toHaveLength(1);
    expect((await getJob(job.id))?.detailCount).toBe(1);
  });
  it("keeps a rate-limited entry pending and pauses the whole job durably", async () => {
    const job = newJob(); await putJob(job); await addRows(job, [{ link: "/1" }, { link: "/2" }]);
    const queue = await pendingDetails(job.id);
    await saveDetail(job.id, queue[0]!.key, undefined, "429", true, Date.now() + 60000);
    expect((await getJob(job.id))?.status).toBe("paused");
    expect((await getJob(job.id))?.detailFailed ?? 0).toBe(0);
    expect(await pendingDetails(job.id)).toHaveLength(2);
    expect(await getRows(job.id)).toHaveLength(2);
  });
  it("requeues only failed details, preserving successful rows and counts", async () => {
    const job = newJob(); await putJob(job); await addRows(job, [{ link: "/1" }, { link: "/2" }]);
    const queue = await pendingDetails(job.id);
    await saveDetail(job.id, queue[0]!.key, { body: "A" });
    await saveDetail(job.id, queue[1]!.key, undefined, "缺少内容");
    const latest = (await getJob(job.id))!; latest.status = "partial"; await putJob(latest);
    const retry = await retryDetails(job.id);
    expect(retry.detailCount).toBe(1); expect(retry.detailPending).toBe(1); expect(retry.detailOnly).toBe(true);
    expect((await pendingDetails(job.id))[0]?.row.link).toBe("/2");
    expect((await getRows(job.id))[0]?.body).toBe("A");
  });
});
