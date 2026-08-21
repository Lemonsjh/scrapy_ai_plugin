import type { ExtractionPlan, SemanticPageSnapshot } from "./schemas.js";

export type RowData = Record<string, string | number | null>;
export type JobStatus = "idle" | "running" | "paused" | "completed" | "failed" | "cancelled";

export interface JobRecord {
  id: string;
  tabId: number;
  url: string;
  plan: ExtractionPlan;
  status: JobStatus;
  page: number;
  rowCount: number;
  startedAt: number;
  updatedAt: number;
  error?: string;
}

export interface FieldMatch {
  fieldId: string;
  count: number;
}

export type ExtensionMessage =
  | { type: "SNAPSHOT_PAGE" }
  | { type: "PREVIEW_PLAN"; plan: ExtractionPlan }
  | { type: "HIGHLIGHT_FIELD"; plan: ExtractionPlan; fieldId: string }
  | { type: "START_PICKER"; fieldId: string }
  | { type: "PICKER_RESULT"; fieldId: string; selectors: string[]; sample: string }
  | { type: "START_JOB"; plan: ExtractionPlan; url: string }
  | { type: "RUN_JOB"; job: JobRecord }
  | { type: "JOB_BATCH"; jobId: string; rows: RowData[]; page: number }
  | { type: "JOB_EVENT"; jobId: string; status: JobStatus; error?: string }
  | { type: "GET_JOB"; jobId?: string }
  | { type: "GET_ROWS"; jobId: string }
  | { type: "PAUSE_JOB"; jobId: string }
  | { type: "RESUME_JOB"; jobId: string }
  | { type: "CANCEL_JOB"; jobId: string }
  | { type: "CONTENT_READY" }
  | { type: "EXPORT_ROWS"; jobId: string; format: "csv" | "json" | "xlsx" }
  | { type: "GET_DIAGNOSTICS" };

export interface SnapshotResponse {
  snapshot: SemanticPageSnapshot;
  summary: { candidates: number; characters: number; redactions: number; truncated: boolean };
}

export interface PreviewResponse {
  rows: RowData[];
  matches: FieldMatch[];
  errors: string[];
}
