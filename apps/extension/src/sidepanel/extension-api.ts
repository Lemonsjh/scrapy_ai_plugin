import type { AiPlanRequest, AiPlanResponse, ExtensionMessage, ExtractionPlan, JobRecord, PreviewResponse, RowData, SnapshotResponse } from "@atlas/shared";
import { AiPlanOutputJsonSchema, AiPlanOutputSchema, AiPlanResponseSchema, AI_SYSTEM_INSTRUCTIONS, aiPlanInput } from "@atlas/shared";

export type ConnectionMode = "proxy" | "direct";
export type ProviderKind = "atlas" | "openai" | "compatible";
export type ApiProtocol = "responses" | "chat_completions";
export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

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

export async function activeTab() {
  const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  if (!tab?.id || !tab.url || !/^https?:/.test(tab.url)) throw new Error("请在普通网页中打开采集台");
  return tab as chrome.tabs.Tab & { id: number; url: string };
}

export async function ensureCollector(tabId: number) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

export async function tabMessage<T>(message: ExtensionMessage): Promise<T> {
  const tab = await activeTab();
  await ensureCollector(tab.id);
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
  return AiPlanOutputSchema.parse(JSON.parse(text));
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
