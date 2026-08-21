import type { ExtensionMessage, FieldRule } from "@atlas/shared";
import { buildSnapshot } from "./snapshot";
import { previewPlan } from "./extractor";
import { queryAllFirst, queryFirst, selectorCandidates } from "./selectors";
import { controlJob, runJob } from "./runner";

const HIGHLIGHT_ATTR = "data-atlas-highlight";
let pickerCleanup: (() => void) | null = null;

function clearHighlights() {
  document.querySelectorAll(`[${HIGHLIGHT_ATTR}]`).forEach((element) => {
    element.removeAttribute(HIGHLIGHT_ATTR);
    (element as HTMLElement).style.removeProperty("outline");
    (element as HTMLElement).style.removeProperty("outline-offset");
  });
}

function highlightField(plan: { rowSelectors: string[]; fields: FieldRule[] }, fieldId: string) {
  clearHighlights();
  const field = plan.fields.find((item) => item.id === fieldId);
  if (!field) return;
  for (const row of queryAllFirst(document, plan.rowSelectors).slice(0, 20)) {
    const element = queryFirst(row, field.selectors) as HTMLElement | null;
    if (!element) continue;
    element.setAttribute(HIGHLIGHT_ATTR, fieldId);
    element.style.setProperty("outline", "2px solid #ff5a36", "important");
    element.style.setProperty("outline-offset", "3px", "important");
  }
  document.querySelector(`[${HIGHLIGHT_ATTR}]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(clearHighlights, 5_000);
}

function startPicker(fieldId: string) {
  pickerCleanup?.();
  const badge = document.createElement("div");
  badge.dataset.atlasUi = "true";
  badge.textContent = "点击选择字段 · Esc 取消";
  Object.assign(badge.style, {
    position: "fixed", zIndex: "2147483647", top: "16px", left: "50%", transform: "translateX(-50%)",
    padding: "10px 14px", borderRadius: "8px", background: "#151814", color: "#f4f1e8",
    font: "600 13px sans-serif", boxShadow: "0 8px 30px #0005",
  });
  document.documentElement.append(badge);
  let hovered: HTMLElement | null = null;
  const move = (event: MouseEvent) => {
    hovered?.style.removeProperty("outline");
    hovered = event.target instanceof HTMLElement && !event.target.closest("[data-atlas-ui]") ? event.target : null;
    hovered?.style.setProperty("outline", "2px solid #ff5a36", "important");
  };
  const cleanup = () => {
    hovered?.style.removeProperty("outline");
    badge.remove();
    document.removeEventListener("mousemove", move, true);
    document.removeEventListener("click", click, true);
    document.removeEventListener("keydown", keydown, true);
    pickerCleanup = null;
  };
  const click = (event: MouseEvent) => {
    if (!(event.target instanceof Element) || event.target.closest("[data-atlas-ui]")) return;
    event.preventDefault(); event.stopPropagation();
    const sample = (event.target.textContent ?? "").trim().slice(0, 200);
    chrome.runtime.sendMessage({ type: "PICKER_RESULT", fieldId, selectors: selectorCandidates(event.target), sample } satisfies ExtensionMessage);
    cleanup();
  };
  const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") cleanup(); };
  document.addEventListener("mousemove", move, true);
  document.addEventListener("click", click, true);
  document.addEventListener("keydown", keydown, true);
  pickerCleanup = cleanup;
}

const marker = "__atlasCollectorLoaded";
const scope = window as typeof window & Record<string, unknown>;

if (!scope[marker]) chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, respond) => {
  if (message.type === "SNAPSHOT_PAGE") {
    const snapshot = buildSnapshot();
    respond({ snapshot, summary: { candidates: snapshot.candidates.length, characters: snapshot.charCount, redactions: snapshot.redactionCount, truncated: snapshot.truncated } });
  }
  if (message.type === "PREVIEW_PLAN") respond(previewPlan(message.plan));
  if (message.type === "HIGHLIGHT_FIELD") { highlightField(message.plan, message.fieldId); respond({ ok: true }); }
  if (message.type === "START_PICKER") { startPicker(message.fieldId); respond({ ok: true }); }
  if (message.type === "RUN_JOB") { runJob(message.job); respond({ ok: true }); }
  if (message.type === "PAUSE_JOB") { controlJob("pause"); respond({ ok: true }); }
  if (message.type === "RESUME_JOB") { controlJob("resume"); respond({ ok: true }); }
  if (message.type === "CANCEL_JOB") { controlJob("cancel"); respond({ ok: true }); }
  return false;
});

if (!scope[marker]) {
  scope[marker] = true;
  chrome.runtime.sendMessage({ type: "CONTENT_READY" } satisfies ExtensionMessage).catch(() => undefined);
}
