import type { DashboardRow, PiMuxrState } from "./status.js";
import { projectName } from "./status.js";

const STATE_PRIORITY: Record<PiMuxrState, number> = {
  ASK: 0,
  ERROR: 1,
  DONE: 2,
  QUEUED: 3,
  RUN: 4,
  IDLE: 5,
  STALE: 6,
};

function actionBucket(row: DashboardRow): number {
  if (row.actionable && row.unread) return 0;
  if (row.actionable) return 1;
  return 2;
}

export function compareDashboardRows(a: DashboardRow, b: DashboardRow): number {
  return actionBucket(a) - actionBucket(b)
    || STATE_PRIORITY[a.displayState] - STATE_PRIORITY[b.displayState]
    || b.lastEventAt - a.lastEventAt
    || projectName(a.cwd).localeCompare(projectName(b.cwd))
    || a.id.localeCompare(b.id);
}

export function sortDashboardRows(rows: DashboardRow[]): DashboardRow[] {
  return [...rows].sort(compareDashboardRows);
}
