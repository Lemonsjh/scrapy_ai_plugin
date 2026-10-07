import type { JobRecord } from "@atlas/shared";

function safeError(value?: string) {
  return value?.replace(/https?:\/\/[^\s，；。)]+/gi, "[URL]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[EMAIL]")
    .replace(/(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)/g, "[PHONE]")
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._-]{16,}|eyJ[A-Za-z0-9_-]{20,})\b/gi, "[TOKEN]")
    .slice(0, 500);
}

export function jobDiagnostics(job: JobRecord) {
  let site: string;
  try { site = new URL(job.url).host; } catch { site = "unknown"; }
  return { id: job.id, site, status: job.status, page: job.page, rowCount: job.rowCount,
    detailCount: job.detailCount ?? 0, detailFailed: job.detailFailed ?? 0, detailPending: job.detailPending ?? 0,
    pagination: job.plan.pagination.type, hasDetail: !!job.plan.detail, fieldCount: job.plan.fields.length,
    startedAt: job.startedAt, updatedAt: job.updatedAt, retryAt: job.retryAt,
    error: safeError(job.error), detailError: safeError(job.detailError) };
}
