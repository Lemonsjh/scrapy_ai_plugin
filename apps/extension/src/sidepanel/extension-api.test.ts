import { afterEach, describe, expect, it, vi } from "vitest";
import { activeTab, tabMessage } from "./extension-api";

function installChromeMock(options: { granted?: boolean; permissionRequest?: boolean; tabs?: chrome.tabs.Tab[] } = {}) {
  const tabs = options.tabs ?? [{ id: 17, url: "https://hotel.meituan.com/data-center" } as chrome.tabs.Tab];
  const events: string[] = [];
  const query = vi.fn().mockResolvedValue(tabs);
  const contains = vi.fn(async () => {
    events.push("contains");
    return options.granted ?? false;
  });
  const request = vi.fn(async () => {
    events.push("request");
    return options.permissionRequest ?? true;
  });
  const executeScript = vi.fn(async () => {
    events.push("inject");
    return [];
  });
  const sendMessage = vi.fn(async () => {
    events.push("message");
    return { ok: true };
  });

  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      tabs: { query, sendMessage },
      permissions: { contains, request },
      scripting: { executeScript },
    },
  });

  return { events, query, contains, request, executeScript, sendMessage };
}

afterEach(() => {
  Reflect.deleteProperty(globalThis, "chrome");
  vi.restoreAllMocks();
});

describe("side panel page access", () => {
  it("resolves the active HTTP page from the browser window", async () => {
    installChromeMock();
    const tab = await activeTab();
    expect(tab.id).toBe(17);
    expect(tab.url).toBe("https://hotel.meituan.com/data-center");
  });

  it("requests the target origin before injecting the collector", async () => {
    const mocks = installChromeMock();
    await tabMessage<{ ok: boolean }>({ type: "SNAPSHOT_PAGE" });

    expect(mocks.contains).toHaveBeenCalledWith({ origins: ["https://hotel.meituan.com/*"] });
    expect(mocks.request).toHaveBeenCalledWith({ origins: ["https://hotel.meituan.com/*"] });
    expect(mocks.executeScript).toHaveBeenCalledWith({ target: { tabId: 17 }, files: ["content.js"] });
    expect(mocks.sendMessage).toHaveBeenCalledWith(17, { type: "SNAPSHOT_PAGE" });
    expect(mocks.events).toEqual(["contains", "request", "inject", "message"]);
  });

  it("does not inject when the user denies site access", async () => {
    const mocks = installChromeMock({ permissionRequest: false });
    await expect(tabMessage({ type: "SNAPSHOT_PAGE" })).rejects.toThrow("需要访问 hotel.meituan.com");
    expect(mocks.events).toEqual(["contains", "request"]);
    expect(mocks.executeScript).not.toHaveBeenCalled();
    expect(mocks.sendMessage).not.toHaveBeenCalled();
  });
});
