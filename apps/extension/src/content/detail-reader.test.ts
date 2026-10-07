// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DetailPlan } from "@atlas/shared";
import { readDetail } from "./detail-reader";
import { retryTime } from "../detail-site";

const detail: DetailPlan = { linkFieldId: "link", maxItems: 5, delayMs: 2000, fields: [{ id: "body", name: "正文", selectors: ["article"], source: "text", required: true, confidence: 1, transforms: [] }] };
afterEach(() => vi.unstubAllGlobals());
describe("single detail preflight", () => {
  it("reads one same-origin page", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("<article>正文</article>"));
    vi.stubGlobal("fetch", fetcher);
    expect(await readDetail(detail, "/1")).toMatchObject({ data: { body: "正文" }, errors: [] });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("propagates Retry-After on 429 without a second request", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 429, headers: { "Retry-After": "120" } }));
    vi.stubGlobal("fetch", fetcher);
    await expect(readDetail(detail, "/1")).rejects.toMatchObject({ blocked: true, retryAt: expect.any(Number) });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not treat the number 429 in an article as a rate limit", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<title>新闻</title><article>收入429万元</article>")));
    expect((await readDetail(detail, "/1")).data.body).toBe("收入429万元");
  });
  it("reports unmatched content instead of a successful preflight", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<p>暂无正文</p>")));
    expect((await readDetail(detail, "/1")).errors.length).toBeGreaterThan(0);
  });
  it("supports seconds and dates in Retry-After", () => {
    expect(retryTime("120", 0)).toBe(120000);
    expect(retryTime("Thu, 01 Jan 1970 00:02:00 GMT", 0)).toBe(120000);
    expect(retryTime("invalid", 0)).toBeUndefined();
  });
});
