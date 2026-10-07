import type { ExtensionMessage } from "@atlas/shared";
import { queryAllFirst, rowSelectorCandidates, selectorCandidates } from "./selectors";
import { scopeCandidates } from "./scope-candidates";

let cleanupPicker: (() => void) | undefined;

export function startPicker(fieldId?: string, rowSelectors: string[] = []) {
  cleanupPicker?.();
  const badge = document.createElement("div");
  badge.dataset.atlasUi = "true";
  Object.assign(badge.style, {
    position: "fixed", zIndex: "2147483647", top: "16px", left: "50%", transform: "translateX(-50%)",
    padding: "12px", maxWidth: "90vw", border: "1px solid #a7bf69", borderRadius: "6px",
    background: "#171a16", color: "#f6f3e9", font: "13px sans-serif", boxShadow: "0 8px 30px #0005",
  });
  const label = document.createElement("div");
  label.style.marginBottom = "8px";
  badge.append(label);
  document.documentElement.append(badge);
  let selected: Element | null = null;
  let outline = ""; let priority = "";
  const trail: Element[] = [];
  const restore = () => {
    if (!(selected instanceof HTMLElement)) return;
    if (outline) selected.style.setProperty("outline", outline, priority); else selected.style.removeProperty("outline");
  };
  const select = (element: Element | null) => {
    restore(); selected = element;
    if (selected instanceof HTMLElement) {
      outline = selected.style.getPropertyValue("outline"); priority = selected.style.getPropertyPriority("outline");
      selected.style.setProperty("outline", `2px solid ${fieldId ? "#ff5a36" : "#c9f04d"}`, "important");
    }
    label.textContent = `${selected ? `${selected.tagName.toLowerCase()}${selected.id ? `#${selected.id}` : ""}` : "移动鼠标到目标内容"} · ↑ 外层 / ↓ 内层 · Enter 确认 · Esc 取消`;
  };
  const parent = () => { if (selected?.parentElement && selected !== document.body) { trail.push(selected); select(selected.parentElement); } };
  const child = () => select(trail.pop() ?? selected?.firstElementChild ?? selected);
  const move = (event: MouseEvent) => {
    if (!(event.target instanceof Element) || event.target.closest("[data-atlas-ui]") || selected === event.target) return;
    trail.length = 0; select(event.target);
  };
  const cleanup = () => {
    restore(); badge.remove();
    document.removeEventListener("mousemove", move, true); document.removeEventListener("click", click, true);
    document.removeEventListener("keydown", keydown, true); cleanupPicker = undefined;
  };
  const confirm = () => {
    if (!selected) return;
    let message: ExtensionMessage;
    if (!fieldId) message = { type: "SCOPE_RESULT", candidates: scopeCandidates(selected) };
    else {
      const row = fieldId !== "__row__" ? queryAllFirst(document, rowSelectors).find((item) => item.contains(selected)) : undefined;
      if (fieldId !== "__row__" && rowSelectors.length && !row) { label.textContent = "该元素不在当前列表行内，请重新选择；必要时先修正列表行容器。"; return; }
      const selectors = fieldId === "__row__" ? rowSelectorCandidates(selected) : selected === row ? [":scope"] : selectorCandidates(selected, row ?? document);
      message = { type: "PICKER_RESULT", fieldId, selectors, sample: (selected.textContent ?? "").trim().slice(0, 200) };
    }
    cleanup(); void chrome.runtime.sendMessage(message).catch(() => undefined);
  };
  const click = (event: MouseEvent) => {
    if (!(event.target instanceof Element) || event.target.closest("[data-atlas-ui]")) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (!selected) select(event.target);
    confirm();
  };
  const keydown = (event: KeyboardEvent) => {
    if (!["Escape", "Enter", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    if (event.key === "Escape") cleanup();
    else if (event.key === "Enter") confirm();
    else if (event.key === "ArrowUp") parent(); else child();
  };
  for (const [text, action] of [["↑ 外层", parent], ["↓ 内层", child], ["确认", confirm], ["取消", cleanup]] as const) {
    const button = document.createElement("button"); button.textContent = text; button.type = "button";
    Object.assign(button.style, { marginRight: "6px", padding: "5px 8px", border: "1px solid #727968", borderRadius: "3px", background: "#f6f3e9", color: "#171a16", cursor: "pointer" });
    button.addEventListener("click", action); badge.append(button);
  }
  select(null);
  document.addEventListener("mousemove", move, true); document.addEventListener("click", click, true);
  document.addEventListener("keydown", keydown, true); cleanupPicker = cleanup;
}
