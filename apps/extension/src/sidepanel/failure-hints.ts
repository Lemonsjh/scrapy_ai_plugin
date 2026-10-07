export function failureHint(message: string) {
  if (/429|限制访问|限流|Too Many Requests/i.test(message)) return "网站正在限流。停止连续重试，等候限制解除后先试读一条；列表数据仍可导出。";
  if (/401|403|验证码|登录|拒绝访问/i.test(message)) return "网站要求登录、验证或拒绝了访问。请手动打开详情确认可读，插件不会绕过验证码或访问限制。";
  if (/Failed to fetch|网络|NetworkError/i.test(message)) return "请求未完成，可能是网络、跨域限制或网站拒绝访问。先手动打开一条详情检查，再试读，不要持续重试。";
  if (/超时|timeout|timed out/i.test(message)) return "页面响应超时。确认网页能够正常打开，减少详情数量后再试读。";
  if (/缺少|为空|选择器|未匹配/i.test(message)) return "页面结构可能与规则不同。先查看原文，再修正选择器并重新试读；不要直接重复批量采集。";
  if (/不在当前网站|不同网站|同域/i.test(message)) return "详情链接与采集网站不匹配。核对链接字段及域名，不能自动采集任意外部网站。";
  return "先查看这一条的完整错误和链接，确认页面与规则后，再补采失败详情。";
}
