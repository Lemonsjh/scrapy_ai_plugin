import { describe, expect, it } from "vitest";
import { isSameSite, preferredDetailUrl } from "./detail-site";

describe("detail site safeguards", () => {
  it("accepts and upgrades a legacy .com link for the current .com.cn host", () => {
    const page = "https://www.gz.chinanews.com.cn/";
    const legacy = "http://www.gz.chinanews.com/jjgz/news.shtml";
    expect(isSameSite(page, legacy)).toBe(true);
    expect(preferredDetailUrl(page, legacy).href).toBe("https://www.gz.chinanews.com.cn/jjgz/news.shtml");
  });

  it("rejects an unrelated site", () => {
    expect(isSameSite("https://www.gz.chinanews.com.cn/", "https://example.com/news")).toBe(false);
  });
});
