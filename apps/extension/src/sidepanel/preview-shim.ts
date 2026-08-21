import type { ExtensionMessage, ExtractionPlan } from "@atlas/shared";

export function installPreviewChrome() {
  const existing = (globalThis as Record<string, unknown>).chrome as { storage?: { local?: unknown } } | undefined;
  if (existing?.storage?.local) return;
  const store: Record<string, unknown> = {};
  const listeners = new Set<(message: unknown) => void>();
  let mockJob: Record<string, unknown> | null = null;
  const mockRows = Array.from({ length: 8 }, (_, index) => ({ field_1: `样本数据 ${index + 1}` }));
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
    if (message.type === "START_JOB") {
      mockJob = { id: "preview-job", tabId: 1, url: message.url, plan: message.plan, status: "running", page: 2, rowCount: 8, startedAt: Date.now(), updatedAt: Date.now() };
      return mockJob;
    }
    if (message.type === "GET_JOB") return mockJob;
    if (message.type === "GET_ROWS") return mockRows;
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
