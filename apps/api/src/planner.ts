import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { AI_SYSTEM_INSTRUCTIONS, AiPlanOutputSchema, aiPlanInput, type AiPlanRequest, type AiPlanResponse } from "@atlas/shared";

export type Planner = (request: AiPlanRequest, requestId: string) => Promise<AiPlanResponse>;

function retryable(error: unknown) {
  const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : 0;
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

async function once<T>(operation: () => Promise<T>) {
  try { return await operation(); }
  catch (error) {
    if (!retryable(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 400));
    return operation();
  }
}

export function createOpenAiPlanner(options: { apiKey: string; defaultModel: string; allowedModels: string[]; allowAnyModel: boolean }): Planner {
  const client = new OpenAI({ apiKey: options.apiKey });
  return async (request, requestId) => {
    const model = request.model || options.defaultModel;
    if (!options.allowAnyModel && !options.allowedModels.includes(model)) {
      throw Object.assign(new Error("该模型未被代理服务允许，请修改 ALLOWED_MODELS 或使用直连模式"), { status: 400 });
    }
    const effort = request.reasoningEffort === "xhigh" ? "high" : request.reasoningEffort;
    const reasoning = effort && effort !== "none"
      ? { effort: effort as "low" | "medium" | "high" }
      : undefined;
    const response = await once(() => client.responses.parse({
      model,
      instructions: AI_SYSTEM_INSTRUCTIONS,
      input: aiPlanInput(request),
      store: false,
      max_output_tokens: 6_000,
      reasoning,
      text: { format: zodTextFormat(AiPlanOutputSchema, "collection_plan") },
    }, { signal: AbortSignal.timeout(30_000) }));
    if (!response.output_parsed) throw new Error("模型未返回可用的结构化采集规则");
    const output = AiPlanOutputSchema.parse(response.output_parsed as unknown);
    return { plan: output.plan, warnings: output.warnings, requestId };
  };
}
