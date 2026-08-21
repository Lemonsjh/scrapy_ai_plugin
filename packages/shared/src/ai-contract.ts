import { z } from "zod";
import { AiPlanOutputSchema, type AiPlanRequest } from "./schemas.js";

export const AI_SYSTEM_INSTRUCTIONS = `你是网页数据采集规则规划器。根据用户意图和经过脱敏的语义 DOM，生成声明式采集规则。
规则：
1. rowSelectors 必须指向重复列表中的单行，并优先使用稳定属性。
2. 字段选择器必须相对于行容器，最多提供 5 个候选。
3. 只能使用 Schema 中允许的转换和过滤；禁止输出 JavaScript、脚本、网络请求或操作指令。
4. href/src 字段通常追加 absolute_url；文本通常追加 trim；价格和数量按需 parse_number。
5. 无法确定时降低 confidence 并写入 warnings，不得猜测页面不存在的字段。
6. 默认限制为 10 页、1000 行、600000 毫秒、1000 毫秒间隔；除非用户明确要求更小范围。
7. 下一页按钮只有在快照中有明确证据时使用；否则 pagination 设为 none。
8. 输出字段名使用用户语言，id 使用简短 ASCII 标识。
9. 最终输出必须是符合 Schema 的 JSON 对象；不要输出 Markdown 代码块、解释文字或 JSON 之外的任何内容。`;

export function aiPlanInput(request: AiPlanRequest) {
  return JSON.stringify({
    intent: request.intent,
    page: request.page,
    snapshot: request.snapshot,
    previousPlan: request.previousPlan,
    correction: request.correction,
  });
}

export const AiPlanOutputJsonSchema = z.toJSONSchema(AiPlanOutputSchema, { target: "draft-7" });
