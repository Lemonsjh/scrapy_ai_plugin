import type { DetailPlan, DetailPreviewResponse, ExtensionMessage, ExtractionPlan } from "@atlas/shared";
import { isSameSite, preferredDetailUrl, retryTime } from "../detail-site";
import { extractDetailDocument, extractRows } from "./extractor";

export class DetailReadError extends Error {
  constructor(message: string, public blocked = false, public retryAt?: number) { super(message); }
}

export async function readDetail(detail: DetailPlan, href: unknown, jobId?: string, signal?: AbortSignal, pageUrl = location.href): Promise<DetailPreviewResponse> {
  if (typeof href !== "string" || !href.trim()) throw new DetailReadError("详情链接为空，请重新选择链接字段");
  const raw = new URL(href, pageUrl);
  if (!/^https?:$/.test(raw.protocol) || !isSameSite(location.href, raw.href)) throw new DetailReadError("详情链接不在当前网站");
  const url = preferredDetailUrl(location.href, raw.href);
  let html: string;
  let finalUrl = url.href;
  if (url.origin === location.origin) {
    let response: Response;
    const request = new AbortController();
    const abort = () => request.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) request.abort();
    const timer = setTimeout(abort, 15_000);
    try {
      response = await fetch(url.href, { credentials: "include", signal: request.signal });
      if (!response.ok) throw new DetailReadError(`详情页返回 ${response.status}`, response.status === 429, retryTime(response.headers.get("retry-after")));
      html = await response.text();
    } catch (cause) {
      if (signal?.aborted) throw new DetailReadError("详情读取已停止");
      if (cause instanceof DetailReadError) throw cause;
      throw new DetailReadError("详情请求失败，请确认该链接能正常打开或稍后再试");
    } finally {
      clearTimeout(timer); signal?.removeEventListener("abort", abort);
    }
    finalUrl = response.url || url.href;
  } else {
    const response = await chrome.runtime.sendMessage({ type: "FETCH_DETAIL", jobId, pageUrl: location.href, url: url.href } satisfies ExtensionMessage);
    if (response?.error) throw new DetailReadError(response.error, response.status === 429, response.retryAt);
    if (typeof response?.html !== "string") throw new DetailReadError("详情页没有返回可读取的内容");
    html = response.html;
    finalUrl = response.url || url.href;
  }
  const document = new DOMParser().parseFromString(html, "text/html");
  const heading = `${document.title} ${document.querySelector("h1")?.textContent ?? ""}`;
  if (/429\s*(too many requests)?|too many requests/i.test(heading)) throw new DetailReadError("网站触发 429 频率限制", true);
  if (!isSameSite(location.href, finalUrl)) throw new DetailReadError("详情页跳转到了其他网站");
  const { data, errors } = extractDetailDocument(document, detail, finalUrl);
  if (Object.values(data).every((value) => value === null || value === "")) errors.push("未提取到详情内容，请修改详情选择器后再次试读");
  return { url: finalUrl, data, errors };
}

export async function previewDetail(plan: ExtractionPlan) {
  if (!plan.detail) throw new Error("请先启用详情采集");
  const first = extractRows(plan).rows[0];
  if (!first) throw new Error("当前列表没有可试读的数据");
  return readDetail(plan.detail, first[plan.detail.linkFieldId]);
}
