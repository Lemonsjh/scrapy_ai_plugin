// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DetailItem, ExtensionMessage, JobRecord } from "@atlas/shared";
import { DetailReadError, readDetail } from "./detail-reader";
import { controlJob, runJob } from "./runner";

vi.mock("./detail-reader", async (importOriginal) => ({
  ...await importOriginal<typeof import("./detail-reader")>(), readDetail: vi.fn(),
}));

const makeJob = (): JobRecord => ({
  id: "test", tabId: 1, url: location.href, status: "running", page: 1, rowCount: 0,
  startedAt: Date.now(), updatedAt: Date.now(),
  plan: {
    mode: "list", rowSelectors: [".item"], fields: [{ id: "link", name: "链接", selectors: ["a"], source: "href", required: true, confidence: 1, transforms: [] }],
    filters: [], pagination: { type: "next_button", selectors: [".next"] },
    limits: { maxRows: 100, maxPages: 10, maxDurationMs: 600000, delayMs: 0 }, deduplicateBy: ["link"],
    detail: { linkFieldId: "link", maxItems: 20, delayMs: 1500, fields: [{ id: "body", name: "详情", selectors: ["article"], source: "text", required: true, confidence: 1, transforms: [] }] },
  },
});

describe("durable collection workflow", () => {
  let job: JobRecord;
  let queue: DetailItem[];
  let messages: ExtensionMessage[];
  beforeEach(() => {
    vi.useFakeTimers(); vi.mocked(readDetail).mockReset();
    job = makeJob(); queue = []; messages = [];
    document.body.innerHTML = '<div class="item"><a href="/1">A</a></div><div class="item"><a href="/2">B</a></div><button class="next">下一页</button>';
    vi.stubGlobal("chrome", { runtime: { sendMessage: vi.fn(async (message: ExtensionMessage) => {
      messages.push(message);
      if (message.type === "GET_PENDING_DETAILS") return [...queue];
      if (message.type === "GET_JOB") return job;
      if (message.type === "JOB_BATCH") {
        queue = message.rows.map((row, index) => ({ key: String(index), row }));
        job.rowCount = message.rows.length; return { rowCount: job.rowCount };
      }
      if (message.type === "SAVE_DETAIL") {
        if (message.blocked) { job.status = "paused"; job.retryAt = message.retryAt; }
        else { queue = queue.filter((item) => item.key !== message.key); if (message.error) job.detailFailed = (job.detailFailed ?? 0) + 1; }
        return job;
      }
      if (message.type === "JOB_EVENT") { job.status = message.status; return job; }
      return undefined;
    }) } });
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("saves all list rows and pauses the entire job on the first 429 without pagination", async () => {
    const clicked = vi.fn(); document.querySelector(".next")!.addEventListener("click", clicked);
    vi.mocked(readDetail).mockRejectedValue(new DetailReadError("详情页返回 429", true, Date.now() + 60000));
    await runJob(job);
    expect(job.status).toBe("paused"); expect(job.rowCount).toBe(2); expect(queue).toHaveLength(2);
    expect(readDetail).toHaveBeenCalledTimes(1); expect(clicked).not.toHaveBeenCalled();
    expect(messages.find((message) => message.type === "SAVE_DETAIL")).toMatchObject({ blocked: true });
    expect(messages.some((message) => message.type === "JOB_EVENT" && message.status === "completed")).toBe(false);
  });

  it("on recovery reads only persisted pending entries, preserving successful entries", async () => {
    job.detailOnly = true; job.rowCount = 2;
    queue = [{ key: "remaining", row: { link: "/2" } }];
    vi.mocked(readDetail).mockResolvedValue({ url: "/2", data: { body: "B" }, errors: [] });
    const running = runJob(job); await vi.runAllTimersAsync(); await running;
    expect(readDetail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(readDetail).mock.calls[0]?.[1]).toBe("/2");
    expect(messages.some((message) => message.type === "JOB_BATCH")).toBe(false);
    expect(queue).toEqual([]); expect(job.status).toBe("completed");
  });

  it("list-only collection never requests a detail page", async () => {
    job.plan.detail = undefined; job.plan.pagination = { type: "none" };
    await runJob(job);
    expect(readDetail).not.toHaveBeenCalled(); expect(job.rowCount).toBe(2); expect(job.status).toBe("completed");
  });
  it("marks a job partial when detail extraction fails", async () => {
    job.detailOnly = true; queue = [{ key: "missing", row: { link: "/2" } }];
    vi.mocked(readDetail).mockResolvedValue({ url: "/2", data: { body: null }, errors: ["正文选择器未匹配"] });
    const running = runJob(job); await vi.runAllTimersAsync(); await running;
    expect(job.status).toBe("partial"); expect(job.detailFailed).toBe(1);
  });
  it("cancel interrupts an active request without starting or saving more details", async () => {
    vi.mocked(readDetail).mockImplementation((_detail, _href, _jobId, signal) => new Promise((resolve) => {
      signal?.addEventListener("abort", () => resolve({ url: "/1", data: { body: "已停止" }, errors: [] }));
    }));
    const running = runJob(job); await vi.advanceTimersByTimeAsync(0);
    expect(readDetail).toHaveBeenCalledTimes(1);
    job.status = "cancelled"; controlJob("cancel"); await running;
    expect(messages.some((message) => message.type === "SAVE_DETAIL")).toBe(false);
    expect(readDetail).toHaveBeenCalledTimes(1);
  });
});
