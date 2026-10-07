import type { ExtensionMessage, FieldRule } from "@atlas/shared";
import { buildSnapshot } from "./snapshot";
import { previewPlan } from "./extractor";
import { queryAllFirst, queryFirst } from "./selectors";
import { controlJob, runJob } from "./runner";
import { previewDetail } from "./detail-reader";
import { startPicker } from "./picker";

const HIGHLIGHT_ATTR = "data-atlas-highlight";
const outlines = new Map<HTMLElement, { value: string; priority: string }>();

function clearHighlights() {
  for (const [element, style] of outlines) {
    element.removeAttribute(HIGHLIGHT_ATTR);
    if (style.value) element.style.setProperty("outline", style.value, style.priority);
    else element.style.removeProperty("outline");
  }
  outlines.clear();
}

function highlightField(plan: { rowSelectors: string[]; fields: FieldRule[] }, fieldId: string) {
  clearHighlights();
  const field = plan.fields.find((item) => item.id === fieldId);
  if (!field) return;
  for (const row of queryAllFirst(document, plan.rowSelectors).slice(0, 20)) {
    const element = queryFirst(row, field.selectors);
    if (!(element instanceof HTMLElement)) continue;
    outlines.set(element, { value: element.style.getPropertyValue("outline"), priority: element.style.getPropertyPriority("outline") });
    element.setAttribute(HIGHLIGHT_ATTR, fieldId);
    element.style.setProperty("outline", "2px solid #ff5a36", "important");
  }
  document.querySelector(`[${HIGHLIGHT_ATTR}]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  window.setTimeout(clearHighlights, 5_000);
}


const marker = "__atlasCollectorLoaded";
const scope = window as typeof window & Record<string, unknown>;

if (!scope[marker]) chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, respond) => {
  if (message.type === "PREVIEW_DETAIL") {
    void previewDetail(message.plan).then(respond).catch((cause) => respond({ error: cause instanceof Error ? cause.message : "详情试读失败" }));
    return true;
  }
  if (message.type === "SNAPSHOT_PAGE") {
    const snapshot = buildSnapshot();
    respond({ snapshot, summary: { candidates: snapshot.candidates.length, characters: snapshot.charCount, redactions: snapshot.redactionCount, truncated: snapshot.truncated } });
  }
  if (message.type === "PREVIEW_PLAN") respond(previewPlan(message.plan));
  if (message.type === "HIGHLIGHT_FIELD") { highlightField(message.plan, message.fieldId); respond({ ok: true }); }
  if (message.type === "START_PICKER") { startPicker(message.fieldId, message.rowSelectors); respond({ ok: true }); }
  if (message.type === "START_SCOPE_PICKER") { startPicker(); respond({ ok: true }); }
  if (message.type === "RUN_JOB") { runJob(message.job); respond({ ok: true }); }
  if (message.type === "PAUSE_JOB") { controlJob("pause"); respond({ ok: true }); }
  if (message.type === "RESUME_JOB") respond(controlJob("resume"));
  if (message.type === "CANCEL_JOB") { controlJob("cancel"); respond({ ok: true }); }
  return false;
});

if (!scope[marker]) {
  scope[marker] = true;
  chrome.runtime.sendMessage({ type: "CONTENT_READY" } satisfies ExtensionMessage).catch(() => undefined);
}
