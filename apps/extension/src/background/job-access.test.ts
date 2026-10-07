import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobRecord } from "@atlas/shared";
import { requireJobPage } from "./job-access";

const job = { id: "job", tabId: 12, url: "https://example.com/list" } as JobRecord;
afterEach(() => vi.unstubAllGlobals());

describe("safe historical task resume", () => {
  it("allows a paginated page only with the existing website permission", async () => {
    const contains = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("chrome", { tabs: { get: vi.fn().mockResolvedValue({ url: "https://example.com/list?page=2" }) }, permissions: { contains } });
    await requireJobPage(job);
    expect(contains).toHaveBeenCalledWith({ origins: ["https://example.com/*"] });
  });
  it("does not restart a task into a closed or unrelated tab", async () => {
    const contains = vi.fn();
    vi.stubGlobal("chrome", { tabs: { get: vi.fn().mockRejectedValue(new Error("missing")) }, permissions: { contains } });
    await expect(requireJobPage(job)).rejects.toThrow("已关闭"); expect(contains).not.toHaveBeenCalled();
    vi.stubGlobal("chrome", { tabs: { get: vi.fn().mockResolvedValue({ url: "https://other.com/" }) }, permissions: { contains } });
    await expect(requireJobPage(job)).rejects.toThrow("其他网站"); expect(contains).not.toHaveBeenCalled();
  });
  it("does not silently request new permission while resuming", async () => {
    const request = vi.fn();
    vi.stubGlobal("chrome", { tabs: { get: vi.fn().mockResolvedValue({ url: job.url }) }, permissions: { contains: vi.fn().mockResolvedValue(false), request } });
    await expect(requireJobPage(job)).rejects.toThrow("已撤销"); expect(request).not.toHaveBeenCalled();
  });
});
