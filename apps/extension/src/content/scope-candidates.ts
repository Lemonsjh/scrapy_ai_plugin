import type { ScopeCandidate } from "@atlas/shared";
import { selectorCandidates } from "./selectors";

function usable(element: Element) {
  if (element.closest("[data-atlas-ui],[hidden],[aria-hidden='true'],script,style")) return false;
  const style = getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && (element.textContent ?? "").trim().length > 4;
}

export function scopeCandidates(scope: Element): ScopeCandidate[] {
  const found: (ScopeCandidate & { score: number })[] = [];
  for (const parent of [scope, ...scope.querySelectorAll("ul,ol,section,div,tbody")].slice(0, 1000)) {
    if (parent.closest("[data-atlas-ui]")) continue;
    const groups = new Map<string, Element[]>();
    for (const child of [...parent.children]) {
      const tag = child.tagName.toLowerCase();
      groups.set(tag, [...(groups.get(tag) ?? []), child]);
    }
    for (const [tag, rows] of groups) {
      const items = rows.filter(usable);
      if (items.length < 2) continue;
      const parentSelector = selectorCandidates(parent)[0];
      if (!parentSelector) continue;
      const links = items.filter((row) => row.matches("a[href]") || !!row.querySelector("a[href]"));
      found.push({
        rowSelector: `${parentSelector} > ${tag}:not([hidden]):not([aria-hidden='true']):not([data-atlas-ui])`,
        count: items.length, hasLink: links.length >= Math.ceil(items.length * 0.6),
        sample: (items[0]?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 100), score: items.length + links.length * 2,
      });
    }
  }
  return found.sort((a, b) => b.score - a.score).filter((item, index, all) => !all.slice(0, index).some((other) => other.rowSelector === item.rowSelector)).slice(0, 5)
    .map(({ score: _score, ...item }) => item);
}
