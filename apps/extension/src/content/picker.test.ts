// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startPicker } from "./picker";
import { queryFirst, rowSelectorCandidates, selectorCandidates } from "./selectors";
import { scopeCandidates } from "./scope-candidates";

const move = (element: Element) => element.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
const key = (value: string) => document.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true }));
let send: ReturnType<typeof vi.fn>;

beforeEach(() => {
  document.body.innerHTML = '<ul id="items"><li class="item"><a id="title-1" href="/1"><span class="title">电影标题 A</span></a></li><li class="item"><a id="title-2" href="/2"><span class="title">电影标题 B</span></a></li></ul><aside>其他内容</aside>';
  send = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal("chrome", { runtime: { sendMessage: send } });
});
afterEach(() => { key("Escape"); document.body.innerHTML = ""; vi.unstubAllGlobals(); });

describe("container and field selection", () => {
  it("picks relative field selectors which work in every row, without row-specific ids", () => {
    startPicker("title", ["#items > li"]);
    const target = document.querySelector("#title-1")!; move(target); key("Enter");
    const message = send.mock.calls[0]![0];
    expect(message.fieldId).toBe("title");
    for (const row of document.querySelectorAll("li")) expect(queryFirst(row, message.selectors)?.tagName).toBe("A");
    expect(message.selectors.join(" ")).not.toContain("title-1");
  });
  it("selects a parent with ArrowUp and restores the original page style", () => {
    const target = document.querySelector("span")! as HTMLElement;
    target.style.setProperty("outline", "1px solid blue", "important");
    startPicker(); move(target); key("ArrowUp"); key("ArrowUp"); key("ArrowUp"); key("Enter");
    expect(send.mock.calls[0]![0].candidates[0].count).toBe(2);
    expect(target.style.getPropertyValue("outline")).toContain("blue");
    expect(target.style.getPropertyPriority("outline")).toBe("important");
    expect(document.querySelector("[data-atlas-ui]")).toBeNull();
  });
  it("rejects a field outside the row container without sending a rule", () => {
    startPicker("title", ["#items > li"]); move(document.querySelector("aside")!); key("Enter");
    expect(send).not.toHaveBeenCalled();
    expect(document.querySelector("[data-atlas-ui]")?.textContent).toContain("不在当前列表行内");
  });
  it("matches the selected row itself with :scope", () => {
    startPicker("title", ["#items > li"]); move(document.querySelector("li")!); key("Enter");
    expect(send.mock.calls[0]![0].selectors).toEqual([":scope"]);
    const row = document.querySelector("li")!; expect(queryFirst(row, [":scope"])).toBe(row);
    const link = row.querySelector("a")!; expect(queryFirst(link, [":scope[href]"])).toBe(link);
    expect(queryFirst(row, [":scope[href]"])).toBeNull();
  });
  it("infers repeated siblings for a row selection instead of one positional item", () => {
    const selectors = rowSelectorCandidates(document.querySelector("li")!);
    expect(document.querySelectorAll(selectors[0]!)).toHaveLength(2);
  });
  it("recognizes direct link rows and excludes hidden and extension UI rows", () => {
    document.body.innerHTML = '<div id="links"><a href="/1">文章标题一</a><a href="/2">文章标题二</a><a hidden>隐藏标题三</a><a data-atlas-ui="true">扩展元素四</a></div>';
    const candidates = scopeCandidates(document.querySelector("#links")!);
    expect(candidates[0]?.hasLink).toBe(true); expect(candidates[0]?.count).toBe(2);
    expect(document.querySelectorAll(candidates[0]!.rowSelector)).toHaveLength(2);
  });
  it("creates an unambiguous relative positional path when labels repeat", () => {
    document.body.innerHTML = '<div><section><b>相同</b><b>目标</b></section><section><b>相同</b></section></div>';
    const root = document.querySelector("div")!; const target = root.querySelectorAll("b")[1]!;
    expect(queryFirst(root, selectorCandidates(target, root))).toBe(target);
  });
  it("cancels without sending and can shrink a parent selection", () => {
    startPicker("title", ["li"]); const target = document.querySelector("span")!;
    move(target); key("ArrowUp"); key("ArrowDown"); key("Enter");
    expect(send.mock.calls[0]![0].selectors[0]).toBe("span.title");
    send.mockClear(); startPicker(); key("Escape"); expect(send).not.toHaveBeenCalled();
  });
});
