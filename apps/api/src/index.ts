import "dotenv/config";
import { buildApp } from "./app.js";
import { createOpenAiPlanner } from "./planner.js";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) throw new Error("OPENAI_API_KEY is required");
const accessTokens = (process.env.BETA_ACCESS_TOKENS ?? "").split(",").map((item) => item.trim()).filter(Boolean);
if (!accessTokens.length) throw new Error("BETA_ACCESS_TOKENS is required");
const defaultModel = process.env.OPENAI_MODEL ?? "gpt-5.4";
const allowedModels = (process.env.ALLOWED_MODELS ?? defaultModel).split(",").map((item) => item.trim()).filter(Boolean);

const app = await buildApp({
  planner: createOpenAiPlanner({ apiKey, defaultModel, allowedModels, allowAnyModel: process.env.ALLOW_ANY_MODEL === "true" }),
  accessTokens,
});

await app.listen({ port: Number(process.env.PORT ?? 8787), host: process.env.HOST ?? "127.0.0.1" });
