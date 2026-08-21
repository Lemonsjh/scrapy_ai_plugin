import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { AiPlanRequestSchema, AiPlanResponseSchema } from "@atlas/shared";
import type { Planner } from "./planner.js";

interface AppOptions {
  planner: Planner;
  accessTokens: string[];
  logger?: boolean;
}

function bearerToken(header: string | undefined) {
  return header?.match(/^Bearer\s+(.+)$/i)?.[1];
}

export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true, bodyLimit: 1_000_000, requestIdHeader: "x-request-id" });
  const allowed = new Set(options.accessTokens.filter(Boolean));

  await app.register(cors, {
    origin(origin, callback) {
      const accepted = !origin || origin.startsWith("chrome-extension://") || /^https?:\/\/localhost(?::\d+)?$/.test(origin);
      callback(accepted ? null : new Error("Origin not allowed"), accepted);
    },
    methods: ["GET", "POST"],
  });
  await app.register(rateLimit, { max: 20, timeWindow: "1 minute", keyGenerator: (request) => bearerToken(request.headers.authorization) ?? request.ip });

  app.get("/health", async () => ({ ok: true, service: "atlas-ai-proxy" }));

  app.post("/api/ai/plan", {
    preHandler: async (request, reply) => {
      const token = bearerToken(request.headers.authorization);
      if (!token || !allowed.has(token)) return reply.code(401).send({ message: "无效的测试访问令牌" });
    },
  }, async (request, reply) => {
    const parsed = AiPlanRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ message: "请求内容无效", issues: parsed.error.issues });
    try {
      const result = await options.planner(parsed.data, request.id);
      const validated = AiPlanResponseSchema.parse(result);
      return reply.send(validated);
    } catch (error) {
      request.log.error({ err: error, requestId: request.id }, "AI planning failed");
      const status = typeof error === "object" && error && "status" in error ? Number((error as { status?: number }).status) : 502;
      const safeStatus = [400, 401, 403, 408, 429].includes(status) ? status : 502;
      return reply.code(safeStatus).send({ message: safeStatus === 429 ? "AI 服务繁忙，请稍后重试" : "AI 页面解析失败", requestId: request.id });
    }
  });

  return app;
}
