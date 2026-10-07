import type { JobRecord } from "@atlas/shared";

export const statusLabel: Record<JobRecord["status"], string> = {
  idle: "等待", running: "采集中", paused: "已暂停", completed: "已完成", partial: "部分完成", failed: "失败", cancelled: "已取消",
};

export function siteLabel(url: string) {
  try { return new URL(url).host; } catch { return url; }
}
