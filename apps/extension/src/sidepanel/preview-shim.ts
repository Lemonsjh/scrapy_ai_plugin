import type { CollectedRow, ExtensionMessage, ExtractionPlan, JobRecord } from "@atlas/shared";

export function installPreviewChrome() {
  const existing = (globalThis as Record<string, unknown>).chrome as { storage?: { local?: unknown } } | undefined;
  if (existing?.storage?.local) return;
  const store: Record<string, unknown> = {};
  const listeners = new Set<(message: unknown) => void>();
  let mockJob: JobRecord | null = null;
  const samplePlan: ExtractionPlan = {
    mode: "list", rowSelectors: [".items > li"], fields: [
      { id: "title", name: "电影名称", source: "text", selectors: ["a"], required: true, confidence: 1, transforms: [] },
      { id: "link", name: "详情链接", source: "href", selectors: ["a"], required: true, confidence: 1, transforms: [] },
    ], pagination: { type: "none" }, filters: [], limits: { maxRows: 100, maxPages: 1, maxDurationMs: 600000, delayMs: 1000 }, deduplicateBy: [],
    detail: { linkFieldId: "link", delayMs: 2000, maxItems: 100, fields: [{ id: "body", name: "详情内容", selectors: ["article"], source: "text", required: true, confidence: 1, transforms: [] }] },
  };
  const jobs: JobRecord[] = [{ id: "history-sample", tabId: 99, url: "https://example.com/movies", plan: samplePlan,
    status: "partial", page: 1, rowCount: 70, detailCount: 70, detailFailed: 5, detailPending: 0, detailError: "Failed to fetch",
    startedAt: Date.now() - 120000, updatedAt: Date.now() - 60000 }];
  const saved = new Map<string, CollectedRow[]>();
  saved.set(jobs[0]!.id, Array.from({ length: 70 }, (_, index) => ({ key: `sample-${index}`, index,
    data: { title: `电影样本 ${index + 1}`, link: `https://example.com/item/${index + 1}`, body: index % 14 ? "这是一段用于本地界面验证的完整正文。" : null },
    detailStatus: index % 14 ? "success" : "failed", detailError: index % 14 ? undefined : "Failed to fetch", pageUrl: "https://example.com/movies" })));
  const previewPlan = (plan: ExtractionPlan) => ({
    rows: [
      Object.fromEntries(plan.fields.map((field) => [field.id, field.source === "href" ? "https://example.com/item/1" : `${field.name}样本 A`])),
      Object.fromEntries(plan.fields.map((field) => [field.id, field.source === "href" ? "https://example.com/item/2" : `${field.name}样本 B`])),
    ],
    matches: plan.fields.map((field) => ({ fieldId: field.id, count: 24 })), errors: [],
  });
  const sendMessage = async (message: ExtensionMessage) => {
    if (message.type === "SNAPSHOT_PAGE") return {
      snapshot: { version: 1, createdAt: new Date().toISOString(), charCount: 18420, redactionCount: 3, truncated: false, candidates: [] },
      summary: { candidates: 3, characters: 18420, redactions: 3, truncated: false },
    };
    if (message.type === "PREVIEW_PLAN") return previewPlan(message.plan);
    if (message.type === "START_SCOPE_PICKER") {
      listeners.forEach((listener) => listener({ type: "SCOPE_RESULT", candidates: [{ rowSelector: ".items > li", count: 25, sample: "肖申克的救赎 · 9.7", hasLink: true }] }));
      return { ok: true };
    }
    if (message.type === "PREVIEW_DETAIL") return { url: "https://example.com/item/1", data: Object.fromEntries((message.plan.detail?.fields ?? []).map((field) => [field.id, "这是一段用于本地界面验证的详情正文。点击单元格可以展开全文。"])), errors: [] };
    if (message.type === "START_JOB") {
      mockJob = { id: crypto.randomUUID(), tabId: 1, url: message.url, plan: message.plan, status: "running", page: 1, rowCount: 8, startedAt: Date.now(), updatedAt: Date.now() };
      jobs.unshift(mockJob);
      saved.set(mockJob.id, Array.from({ length: 8 }, (_, index) => ({ key: `${mockJob!.id}-${index}`, index, data: Object.fromEntries(message.plan.fields.map((field) => [field.id, field.source === "href" ? `https://example.com/item/${index + 1}` : `${field.name}样本 ${index + 1}`])) })));
      return mockJob;
    }
    if (message.type === "GET_JOB") return message.jobId ? jobs.find((job) => job.id === message.jobId) : mockJob;
    if (message.type === "GET_TAB_JOB") return jobs.find((job) => job.tabId === message.tabId);
    if (message.type === "LIST_JOBS") return [...jobs].sort((a, b) => b.updatedAt - a.updatedAt);
    if (message.type === "GET_ROW_RECORDS") return saved.get(message.jobId) ?? [];
    if (message.type === "GET_ROWS") return (saved.get(message.jobId) ?? []).map((row) => row.data);
    if (["PAUSE_JOB", "RESUME_JOB", "CANCEL_JOB"].includes(message.type) && mockJob) {
      mockJob.status = message.type === "PAUSE_JOB" ? "paused" : message.type === "RESUME_JOB" ? "running" : "cancelled";
      return mockJob;
    }
    if (message.type === "GET_DIAGNOSTICS") return { version: "preview", jobs: mockJob ? [mockJob] : [] };
    return { ok: true };
  };
  const mock = {
    tabs: { query: async () => [{ id: 1, url: "https://example.com/products", title: "设计用品目录" }], sendMessage: (_id: number, message: ExtensionMessage) => sendMessage(message) },
    scripting: { executeScript: async () => [] },
    permissions: { contains: async () => true, request: async () => true },
    storage: { local: { get: async (key: string) => ({ [key]: store[key] }), set: async (values: Record<string, unknown>) => Object.assign(store, values) } },
    runtime: {
      sendMessage,
      onMessage: { addListener: (listener: (message: unknown) => void) => listeners.add(listener), removeListener: (listener: (message: unknown) => void) => listeners.delete(listener) },
    },
  };
  if (existing) Object.assign(existing, mock);
  else (globalThis as Record<string, unknown>).chrome = mock;
}
