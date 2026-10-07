import { useCallback, useEffect, useRef, useState } from "react";
import type { CollectedRow, JobRecord } from "@atlas/shared";
import { runtimeMessage } from "./extension-api";

export function useJobResults(onError: (message: string) => void) {
  const [job, setJob] = useState<JobRecord | null>(null);
  const [saved, setSaved] = useState<{ jobId: string; records: CollectedRow[] } | null>(null);
  const currentId = useRef(job?.id);
  currentId.current = job?.id;
  const refreshJob = useCallback(async () => {
    if (!job) return;
    const id = job.id;
    try {
      const [latest, records] = await Promise.all([
        runtimeMessage<JobRecord | undefined>({ type: "GET_JOB", jobId: id }),
        runtimeMessage<CollectedRow[]>({ type: "GET_ROW_RECORDS", jobId: id }),
      ]);
      if (currentId.current !== id) return;
      if (!latest) throw new Error("任务记录不存在，请重新选择历史任务");
      setJob(latest); setSaved({ jobId: id, records });
    } catch (cause) {
      if (currentId.current === id) onError(cause instanceof Error ? cause.message : "读取任务失败");
    }
  }, [job?.id, onError]);

  useEffect(() => {
    if (!job) return;
    let polling = false;
    const refresh = async () => { if (!polling) { polling = true; await refreshJob(); polling = false; } };
    void refresh();
    if (!["running", "paused"].includes(job.status)) return;
    const timer = window.setInterval(() => void refresh(), 1000);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status, refreshJob]);

  return { job, setJob, refreshJob, records: saved?.jobId === job?.id ? saved?.records ?? [] : [] };
}
