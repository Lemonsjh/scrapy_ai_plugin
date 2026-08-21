import { z } from "zod";

const selector = z.string().min(1).max(500).refine(
  (value) => !/(javascript:|<script|\beval\s*\(|new\s+Function)/i.test(value),
  "Selector contains forbidden content",
);

export const TransformRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("trim") }),
  z.object({ type: z.literal("replace"), search: z.string().max(200), replacement: z.string().max(200) }),
  z.object({ type: z.literal("regex_extract"), pattern: z.string().max(300), group: z.number().int().min(0).max(20).default(0) }),
  z.object({ type: z.literal("parse_number") }),
  z.object({ type: z.literal("parse_date") }),
  z.object({ type: z.literal("absolute_url") }),
  z.object({ type: z.literal("fallback"), value: z.string().max(500) }),
]);

export const FieldRuleSchema = z.object({
  id: z.string().min(1).max(80).regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().min(1).max(80),
  selectors: z.array(selector).min(1).max(5),
  source: z.enum(["text", "html", "href", "src", "attribute"]),
  attribute: z.string().min(1).max(80).optional(),
  required: z.boolean(),
  confidence: z.number().min(0).max(1),
  transforms: z.array(TransformRuleSchema).max(8).default([]),
}).superRefine((field, ctx) => {
  if (field.source === "attribute" && !field.attribute) {
    ctx.addIssue({ code: "custom", path: ["attribute"], message: "attribute is required" });
  }
});

export const PaginationRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({ type: z.literal("next_button"), selectors: z.array(selector).min(1).max(5) }),
  z.object({
    type: z.literal("infinite_scroll"),
    idleMs: z.number().int().min(300).max(10_000),
    maxNoChangeRounds: z.number().int().min(1).max(10),
  }),
]);

export const FilterRuleSchema = z.object({
  fieldId: z.string().min(1).max(80),
  operator: z.enum(["eq", "ne", "contains", "gt", "gte", "lt", "lte", "regex"]),
  value: z.union([z.string().max(500), z.number(), z.boolean()]),
});

export const ExtractionPlanSchema = z.object({
  mode: z.literal("list"),
  rowSelectors: z.array(selector).min(1).max(5),
  fields: z.array(FieldRuleSchema).min(1).max(40),
  pagination: PaginationRuleSchema,
  filters: z.array(FilterRuleSchema).max(20).default([]),
  limits: z.object({
    maxPages: z.number().int().min(1).max(100),
    maxRows: z.number().int().min(1).max(100_000),
    maxDurationMs: z.number().int().min(5_000).max(86_400_000),
    delayMs: z.number().int().min(0).max(60_000),
  }),
  deduplicateBy: z.array(z.string().min(1).max(80)).max(10),
});

export const SemanticNodeSchema: z.ZodType<SemanticNode> = z.lazy(() => z.object({
  nodeId: z.string(),
  tag: z.string(),
  role: z.string().optional(),
  text: z.string().optional(),
  attrs: z.record(z.string(), z.string()).optional(),
  children: z.array(SemanticNodeSchema).optional(),
}));

export const SemanticPageSnapshotSchema = z.object({
  version: z.literal(1),
  createdAt: z.string(),
  charCount: z.number().int().nonnegative(),
  redactionCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
  candidates: z.array(z.object({
    selector: z.string(),
    score: z.number(),
    sampleCount: z.number().int(),
    rows: z.array(SemanticNodeSchema).max(5),
  })).max(3),
});

export const AiPlanRequestSchema = z.object({
  intent: z.string().min(3).max(2_000),
  page: z.object({ url: z.string().url(), title: z.string().max(500), language: z.string().max(30).optional() }),
  snapshot: SemanticPageSnapshotSchema,
  previousPlan: ExtractionPlanSchema.optional(),
  correction: z.string().max(2_000).optional(),
  model: z.string().min(1).max(160).optional(),
  reasoningEffort: z.enum(["none", "low", "medium", "high", "xhigh"]).optional(),
});

export const AiPlanOutputSchema = z.object({
  plan: ExtractionPlanSchema,
  warnings: z.array(z.string().max(500)).max(20),
});

export const AiPlanResponseSchema = z.object({
  ...AiPlanOutputSchema.shape,
  requestId: z.string(),
});

export interface SemanticNode {
  nodeId: string;
  tag: string;
  role?: string;
  text?: string;
  attrs?: Record<string, string>;
  children?: SemanticNode[];
}

export type TransformRule = z.infer<typeof TransformRuleSchema>;
export type FieldRule = z.infer<typeof FieldRuleSchema>;
export type PaginationRule = z.infer<typeof PaginationRuleSchema>;
export type FilterRule = z.infer<typeof FilterRuleSchema>;
export type ExtractionPlan = z.infer<typeof ExtractionPlanSchema>;
export type SemanticPageSnapshot = z.infer<typeof SemanticPageSnapshotSchema>;
export type AiPlanRequest = z.infer<typeof AiPlanRequestSchema>;
export type AiPlanOutput = z.infer<typeof AiPlanOutputSchema>;
export type AiPlanResponse = z.infer<typeof AiPlanResponseSchema>;
