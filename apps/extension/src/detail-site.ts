const multiPartSuffixes = new Set(["com.cn", "net.cn", "org.cn", "gov.cn", "edu.cn", "co.uk", "org.uk", "ac.uk"]);

export function siteDomain(pageUrl: string) {
  const host = new URL(pageUrl).hostname.toLowerCase();
  if (host === "localhost" || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host;
  const labels = host.split(".");
  const size = multiPartSuffixes.has(labels.slice(-2).join(".")) ? 3 : 2;
  return labels.length > size ? labels.slice(-size).join(".") : host;
}

export function isSameSite(pageUrl: string, detailUrl: string) {
  const page = new URL(pageUrl);
  const detail = new URL(detailUrl);
  return siteDomain(page.href) === siteDomain(detail.href) || chinaNewsAlias(page.hostname, detail.hostname);
}

function chinaNewsAlias(pageHost: string, detailHost: string) {
  const withoutCn = (host: string) => host.replace(/\.com\.cn$/i, ".com");
  return withoutCn(pageHost) === withoutCn(detailHost)
    && (pageHost.endsWith(".com.cn") || detailHost.endsWith(".com.cn"));
}

export function preferredDetailUrl(pageUrl: string, detailUrl: string) {
  const page = new URL(pageUrl);
  const detail = new URL(detailUrl);
  if (chinaNewsAlias(page.hostname, detail.hostname)) detail.hostname = page.hostname;
  if (page.protocol === "https:" && detail.protocol === "http:") detail.protocol = "https:";
  return detail;
}

export function detailPermissionPattern(pageUrl: string) {
  const domain = siteDomain(pageUrl);
  return `*://${domain === "localhost" || /^\d/.test(domain) ? domain : `*.${domain}`}/*`;
}
