import type { JobRecord } from "@atlas/shared";

export async function requireJobPage(job: JobRecord) {
  let tab: chrome.tabs.Tab;
  try { tab = await chrome.tabs.get(job.tabId); }
  catch { throw new Error("原采集标签页已关闭。已保存结果仍可导出；请打开原网站并在历史中复用规则创建新任务。"); }
  if (!tab.url || new URL(tab.url).origin !== new URL(job.url).origin) throw new Error("原标签页已切换到其他网站，不能继续这个任务。请返回原网站，或在当前页复用规则新建任务。");
  if (!await chrome.permissions.contains({ origins: [`${new URL(tab.url).origin}/*`] })) throw new Error("原网站访问权限已撤销。请切换到该网站，通过页面检查重新授权后再继续。");
}
