import type { AiPlanRequest, AiPlanResponse, ExtensionMessage, ExtractionPlan, JobRecord, PreviewResponse, RowData, SnapshotResponse } from "@atlas/shared";
import { AiPlanOutputJsonSchema, AiPlanOutputSchema, AiPlanResponseSchema, AI_SYSTEM_INSTRUCTIONS, aiPlanInput, ExtractionPlanSchema } from "@atlas/shared";
import { detailPermissionPattern } from "../detail-site";

export type ConnectionMode = "proxy" | "direct";
export type ProviderKind = "atlas" | "openai" | "compatible";
export type ApiProtocol = "responses" | "chat_completions";
export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
export type ActiveWebTab = chrome.tabs.Tab & { id: number; url: string };

export interface Settings {
  aiEnabled: boolean;
  connectionMode: ConnectionMode;
  providerKind: ProviderKind;
  providerName: string;
  apiBase: string;
  accessToken: string;
  apiKey: string;
  model: string;
  apiProtocol: ApiProtocol;
  reasoningEffort: ReasoningEffort;
}

export const defaultSettings: Settings = {
  aiEnabled: true, connectionMode: "proxy", providerKind: "atlas", providerName: "Atlas Proxy",
  apiBase: "http://localhost:8787", accessToken: "", apiKey: "", model: "gpt-5.4", apiProtocol: "responses", reasoningEffort: "low",
};

export const providerPresets: Record<ProviderKind, Pick<Settings, "providerName" | "apiBase" | "apiProtocol">> = {
  atlas: { providerName: "Atlas Proxy", apiBase: "http://localhost:8787", apiProtocol: "responses" },
  openai: { providerName: "OpenAI", apiBase: "https://api.openai.com/v1", apiProtocol: "responses" },
  compatible: { providerName: "Custom compatible API", apiBase: "", apiProtocol: "chat_completions" },
};

function webTab(tabs: chrome.tabs.Tab[]) {
  return tabs.find((item) => item.id !== undefined && /^https?:\/\//i.test(item.url ?? ""));
}

export async function activeTab(): Promise<ActiveWebTab> {
  // A global side panel can outlive the action gesture that originally opened it,
  // so do not rely on activeTab to expose sensitive Tab.url fields. The manifest
  // requests the narrow `tabs` permission for URL discovery, then page access is
  // still requested per-origin via optional_host_permissions.
  const lastFocused = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const fallback = lastFocused.length ? [] : await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = webTab(lastFocused) ?? webTab(fallback);
  if (!tab?.url || tab.id === undefined) {
    throw new Error("未识别到可采集网页。请先切换到普通 HTTP/HTTPS 页面后重试。");
  }
  return tab as ActiveWebTab;
}

function pageOriginPattern(pageUrl: string) {
  const url = new URL(pageUrl);
  if (!/^https?:$/.test(url.protocol)) throw new Error("Atlas 仅支持普通 HTTP/HTTPS 网页");
  return `${url.origin}/*`;
}

export async function ensurePagePermission(pageUrl: string) {
  const origin = pageOriginPattern(pageUrl);
  if (await chrome.permissions.contains({ origins: [origin] })) return;
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) {
    throw new Error(`需要访问 ${new URL(pageUrl).host} 才能检查页面，请允许当前网站访问权限。`);
  }
}

export async function ensureCollector(tab: ActiveWebTab) {
  await ensurePagePermission(tab.url);
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`无法在当前页面启动采集器。请刷新页面后重试；如果仍失败，该页面可能禁止扩展脚本注入。${detail ? ` (${detail})` : ""}`);
  }
}

export async function tabMessage<T>(message: ExtensionMessage): Promise<T> {
  const tab = await activeTab();
  await ensureCollector(tab);
  const response = await chrome.tabs.sendMessage(tab.id, message);
  if (response?.error) throw new Error(response.error);
  return response as T;
}

export async function runtimeMessage<T>(message: ExtensionMessage): Promise<T> {
  const response = await chrome.runtime.sendMessage(message);
  if (response?.error) throw new Error(response.error);
  return response as T;
}

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get("settings");
  return { ...defaultSettings, ...(stored.settings as Partial<Settings> | undefined) };
}

export async function saveSettings(settings: Settings) {
  await chrome.storage.local.set({ settings });
}

function normalizedBase(apiBase: string) {
  const url = new URL(apiBase.trim());
  if (!/^https?:$/.test(url.protocol)) throw new Error("接口地址只支持 HTTP 或 HTTPS");
  return url.href.replace(/\/$/, "");
}

async function ensureApiPermission(apiBase: string) {
  const origin = `${new URL(apiBase).origin}/*`;
  const granted = await chrome.permissions.contains({ origins: [origin] });
  if (!granted && !await chrome.permissions.request({ origins: [origin] })) throw new Error("未获得模型服务地址访问权限");
}

async function readBody(response: Response) {
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) throw new Error(String(body?.message ?? (body?.error as { message?: string } | undefined)?.message ?? `模型服务错误 (${response.status})`));
  return body ?? {};
}

function outputText(body: Record<string, unknown>) {
  if (typeof body.output_text === "string") return body.output_text;
  const items = Array.isArray(body.output) ? body.output : [];
  for (const item of items) {
    const contents = (item as { content?: unknown[] }).content;
    if (!Array.isArray(contents)) continue;
    const text = contents.find((content) => (content as { type?: string }).type === "output_text") as { text?: string } | undefined;
    if (text?.text) return text.text;
  }
  throw new Error("模型没有返回结构化文本");
}

export async function ensureDetailPermission(pageUrl: string) {
  const origin = detailPermissionPattern(pageUrl);
  if (await chrome.permissions.contains({ origins: [origin] })) return;
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) throw new Error(`需要访问 ${new URL(pageUrl).hostname} 的子站详情页，才能采集正文。`);
}

const safeTransforms = new Set(["trim", "parse_number", "parse_date", "absolute_url"]);
const sourceAliases: Record<string, "text" | "html" | "href" | "src" | "attribute"> = {
  text: "text", content: "text", textcontent: "text", html: "html", href: "href", link: "href", url: "href",
  src: "src", image: "src", img: "src", attribute: "attribute", attr: "attribute",
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function strings(value: unknown) {
  return (Array.isArray(value) ? value : [value]).filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function numberOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizePlan(input: unknown) {
  const raw = record(input);
  if (!raw) return null;
  const rawFields = Array.isArray(raw.fields) ? raw.fields : [];
  const fields = rawFields.map((value, index) => {
    const field = record(value);
    if (!field) return null;
    const source = sourceAliases[String(field.source ?? "text").toLowerCase()] ?? "text";
    const selectors = strings(field.selectors ?? field.selector ?? field.cssSelector).slice(0, 5);
    if (!selectors.length) return null;
    const transforms = strings(field.transforms).filter((type) => safeTransforms.has(type)).map((type) => ({ type }));
    if (!transforms.length) transforms.push({ type: source === "href" || source === "src" ? "absolute_url" : "trim" });
    const id = String(field.id ?? field.key ?? `field_${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || `field_${index + 1}`;
    const normalized = {
      id, name: String(field.name ?? field.label ?? `字段 ${index + 1}`).slice(0, 80), selectors, source,
      required: field.required === true || field.required === "true",
      confidence: Math.min(1, Math.max(0, numberOr(field.confidence, 0.7))), transforms,
      ...(source === "attribute" && typeof field.attribute === "string" ? { attribute: field.attribute.slice(0, 80) } : {}),
    };
    return source === "attribute" && !normalized.attribute ? { ...normalized, source: "text" as const } : normalized;
  }).filter((field): field is NonNullable<typeof field> => !!field);
  if (!fields.length) return null;
  const pagination = record(raw.pagination) ?? {};
  const pageType = pagination.type;
  const normalizedPagination = pageType === "next_button" && strings(pagination.selectors).length
    ? { type: "next_button" as const, selectors: strings(pagination.selectors).slice(0, 5) }
    : pageType === "infinite_scroll"
      ? { type: "infinite_scroll" as const, idleMs: Math.max(300, Math.min(10_000, numberOr(pagination.idleMs, 1500))), maxNoChangeRounds: Math.max(1, Math.min(10, numberOr(pagination.maxNoChangeRounds, 3)) ) }
      : { type: "none" as const };
  const limits = record(raw.limits) ?? {};
  return {
    mode: "list" as const, rowSelectors: strings(raw.rowSelectors ?? raw.rowSelector ?? raw.listSelector).slice(0, 5), fields,
    pagination: normalizedPagination, filters: [],
    limits: {
      maxPages: Math.max(1, Math.min(100, numberOr(limits.maxPages, 10))), maxRows: Math.max(1, Math.min(100_000, numberOr(limits.maxRows, 1000))),
      maxDurationMs: Math.max(5_000, Math.min(86_400_000, numberOr(limits.maxDurationMs, 600_000))), delayMs: Math.max(0, Math.min(60_000, numberOr(limits.delayMs, 1000))),
    }, deduplicateBy: strings(raw.deduplicateBy).slice(0, 10),
  };
}

function invalidPlanError() {
  return new Error("模型返回的采集规则不完整，Atlas 已拒绝执行。请改用支持结构化输出的模型，或在对话中要求“只返回完整采集规则”。");
}

export function parseAiPlanOutput(text: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("模型返回的内容不是有效 JSON");
  }

  const standard = AiPlanOutputSchema.safeParse(parsed);
  if (standard.success) return standard.data;

  // Some OpenAI-compatible providers honor json_object but ignore the requested
  // envelope and return the ExtractionPlan itself. Accept that safe subset and
  // normalize it locally instead of failing an otherwise valid plan.
  const barePlan = ExtractionPlanSchema.safeParse(parsed);
  if (barePlan.success) {
    return {
      plan: barePlan.data,
      warnings: ["兼容模型返回了裸采集规则，Atlas 已自动规范为标准结果。"],
    };
  }

  const envelope = record(parsed);
  const recovered = normalizePlan(envelope?.plan ?? parsed);
  const normalized = recovered && AiPlanOutputSchema.safeParse({
    plan: recovered,
    warnings: [...strings(envelope?.warnings), "兼容模型省略了部分安全默认项，Atlas 已补全；请核对字段后再开始采集。"],
  });
  if (normalized?.success) return normalized.data;
  throw invalidPlanError();
}

async function directPlan(request: AiPlanRequest, settings: Settings) {
  if (!settings.apiKey.trim()) throw new Error("请填写模型 API Key");
  if (!settings.model.trim()) throw new Error("请填写模型名称");
  const apiBase = normalizedBase(settings.apiBase);
  await ensureApiPermission(apiBase);
  const headers = { "content-type": "application/json", authorization: `Bearer ${settings.apiKey.trim()}` };
  const input = aiPlanInput(request);
  const body = settings.apiProtocol === "responses"
    ? await readBody(await fetch(`${apiBase}/responses`, { method: "POST", headers, body: JSON.stringify({
      model: settings.model.trim(), instructions: AI_SYSTEM_INSTRUCTIONS, input, store: false, reasoning: { effort: settings.reasoningEffort },
      text: { format: { type: "json_schema", name: "collection_plan", strict: true, schema: AiPlanOutputJsonSchema } },
    }) }))
    : await readBody(await fetch(`${apiBase}/chat/completions`, { method: "POST", headers, body: JSON.stringify({
      model: settings.model.trim(), messages: [{ role: "system", content: AI_SYSTEM_INSTRUCTIONS }, { role: "user", content: input }],
      response_format: settings.providerKind === "openai"
        ? { type: "json_schema", json_schema: { name: "collection_plan", strict: true, schema: AiPlanOutputJsonSchema } }
        : { type: "json_object" },
    }) }));
  const text = settings.apiProtocol === "responses" ? outputText(body) : String((body.choices as { message?: { content?: string } }[] | undefined)?.[0]?.message?.content ?? "");
  return parseAiPlanOutput(text);
}

export async function testAiConnection(settings: Settings) {
  const apiBase = normalizedBase(settings.apiBase);
  await ensureApiPermission(apiBase);
  const token = settings.connectionMode === "direct" ? settings.apiKey.trim() : settings.accessToken.trim();
  const suffix = settings.connectionMode === "proxy" ? "/health" : "/models";
  await readBody(await fetch(`${apiBase}${suffix}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }));
}

export async function analyzePage(request: AiPlanRequest, settings: Settings): Promise<AiPlanResponse> {
  if (!settings.aiEnabled) throw new Error("AI 已关闭，请使用手动点选");
  const configured = { ...request, model: settings.model.trim(), reasoningEffort: settings.reasoningEffort };
  if (settings.connectionMode === "direct") {
    const output = await directPlan(configured, settings);
    return AiPlanResponseSchema.parse({ ...output, requestId: crypto.randomUUID() });
  }
  if (!settings.accessToken.trim()) throw new Error("请先填写代理访问令牌");
  const apiBase = normalizedBase(settings.apiBase);
  await ensureApiPermission(apiBase);
  const body = await readBody(await fetch(`${apiBase}/api/ai/plan`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${settings.accessToken.trim()}` }, body: JSON.stringify(configured),
  }));
  return AiPlanResponseSchema.parse(body);
}

export const inspectPage = () => tabMessage<SnapshotResponse>({ type: "SNAPSHOT_PAGE" });
export const previewPlan = (plan: ExtractionPlan) => tabMessage<PreviewResponse>({ type: "PREVIEW_PLAN", plan });
export const getLatestJob = () => runtimeMessage<JobRecord | undefined>({ type: "GET_JOB" });
export const getRows = (jobId: string) => runtimeMessage<RowData[]>({ type: "GET_ROWS", jobId });
