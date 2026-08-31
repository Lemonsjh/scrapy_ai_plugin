import type { SemanticNode, SemanticPageSnapshot } from "@atlas/shared";
import { selectorCandidates } from "./selectors";

const MAX_CHARS = 60_000;
const hiddenTags = new Set(["script", "style", "noscript", "svg", "canvas", "template"]);
let redactionCount = 0;
let nodeCounter = 0;

export function redact(text: string) {
  const rules: [RegExp, string][] = [
    [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]"],
    [/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g, "[PHONE]"],
    [/\b(?:sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{16,}|eyJ[A-Za-z0-9_-]{20,})\b/g, "[TOKEN]"],
  ];
  let result = text;
  for (const [pattern, replacement] of rules) {
    result = result.replace(pattern, () => {
      redactionCount += 1;
      return replacement;
    });
  }
  return result.replace(/\s+/g, " ").trim();
}

function visible(element: Element) {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

function attributes(element: Element) {
  const kept: Record<string, string> = {};
  for (const attribute of [...element.attributes]) {
    const allowed = /^(id|role|itemprop|aria-[\w-]+|data-[\w-]+|href|src)$/i.test(attribute.name);
    if (!allowed || attribute.value.length > 300 || /^on/i.test(attribute.name)) continue;
    let value = attribute.value;
    if (attribute.name === "href" || attribute.name === "src") {
      try { value = new URL(value, location.href).href; } catch { /* keep original */ }
    }
    kept[attribute.name] = redact(value);
  }
  return Object.keys(kept).length ? kept : undefined;
}

function semanticNode(element: Element, depth = 0): SemanticNode | null {
  const tag = element.tagName.toLowerCase();
  if (hiddenTags.has(tag) || element.hasAttribute("data-atlas-ui") || !visible(element)) return null;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    if (element instanceof HTMLInputElement && element.type === "password") return null;
  }

  const directText = [...element.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent ?? "")
    .join(" ");
  const children = depth < 5
    ? [...element.children].map((child) => semanticNode(child, depth + 1)).filter(Boolean) as SemanticNode[]
    : [];
  const text = redact(directText).slice(0, 500);
  const attrs = attributes(element);
  if (!text && !attrs && !children.length) return null;
  return {
    nodeId: `n${++nodeCounter}`,
    tag,
    role: element.getAttribute("role") || undefined,
    text: text || undefined,
    attrs,
    children: children.length ? children : undefined,
  };
}

function candidateContainers() {
  const candidates: { element: Element; score: number }[] = [];
  for (const element of [...document.body.querySelectorAll("main,section,ul,ol,div,table,tbody")]) {
    if (!visible(element) || element.children.length < 3 || element.children.length > 200) continue;
    const tags = [...element.children].map((child) => child.tagName);
    const dominant = Math.max(...Object.values(tags.reduce<Record<string, number>>((acc, tag) => {
      acc[tag] = (acc[tag] ?? 0) + 1;
      return acc;
    }, {})));
    const ratio = dominant / tags.length;
    const textLength = (element.textContent ?? "").trim().length;
    if (ratio < 0.6 || textLength < 40) continue;
    candidates.push({ element, score: ratio * Math.min(tags.length, 20) + Math.min(textLength / 1000, 5) });
  }
  return candidates
    .sort((a, b) => b.score - a.score)
    .filter((item, index, all) => !all.slice(0, index).some((other) => other.element.contains(item.element)))
    .slice(0, 3);
}

export function isNextPageLabel(label: string) {
  return /^(?:(?:下一页|下页|后页|next|更多)\s*[›»>]?|[›»>])\s*$/i.test(label);
}

function paginationCandidates() {
  return [...document.querySelectorAll("a,button,[role='button']")]
    .filter((element) => visible(element))
    .map((element) => ({ element, label: (element.textContent ?? element.getAttribute("aria-label") ?? "").replace(/\s+/g, " ").trim() }))
    .filter(({ element, label }) => isNextPageLabel(label) && !element.matches(":disabled,[aria-disabled='true']"))
    .map(({ element, label }) => ({ selector: selectorCandidates(element)[0], label }))
    .filter((item): item is { selector: string; label: string } => !!item.selector)
    .slice(0, 5);
}

export function buildSnapshot(): SemanticPageSnapshot {
  redactionCount = 0;
  nodeCounter = 0;
  const candidates = candidateContainers().map(({ element, score }) => ({
    selector: selectorCandidates(element)[0] ?? element.tagName.toLowerCase(),
    score: Number(score.toFixed(2)),
    sampleCount: element.children.length,
    rows: [...element.children].slice(0, 5).map((child) => semanticNode(child)).filter(Boolean) as SemanticNode[],
  }));
  const pages = paginationCandidates();

  if (!candidates.length) {
    const body = semanticNode(document.body);
    if (body) candidates.push({ selector: "body", score: 1, sampleCount: 1, rows: [body] });
  }

  let serialized = JSON.stringify({ candidates, paginationCandidates: pages });
  let truncated = false;
  if (serialized.length > MAX_CHARS) {
    truncated = true;
    while (serialized.length > MAX_CHARS && candidates.some((item) => item.rows.length > 1)) {
      candidates.sort((a, b) => b.rows.length - a.rows.length)[0]?.rows.pop();
      serialized = JSON.stringify({ candidates, paginationCandidates: pages });
    }
    if (serialized.length > MAX_CHARS) {
      candidates.splice(1);
      serialized = JSON.stringify({ candidates, paginationCandidates: pages }).slice(0, MAX_CHARS);
    }
  }
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    charCount: Math.min(serialized.length, MAX_CHARS),
    redactionCount,
    truncated,
    candidates,
    paginationCandidates: pages,
  };
}
