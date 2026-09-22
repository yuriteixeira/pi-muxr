import type { DashboardConfig, DashboardRow, PiDashStatus, TmuxPane } from "../domain/status.js";
import { isActionableStatus, isDismissedForCurrentEvent, isUnreadStatus } from "../domain/status.js";
import { sortDashboardRows } from "../domain/sorting.js";

export function buildDashboardRows(statuses: PiDashStatus[], panes: TmuxPane[], config: DashboardConfig, now = Date.now()): DashboardRow[] {
  const panesById = new Map(panes.map((pane) => [pane.paneId, pane]));
  const rows = statuses.map((status) => toDashboardRow(status, panesById, config, now));
  return sortDashboardRows(rows)
    .filter((row) => row.displayState !== "STALE")
    .filter((row) => config.showDismissedRows || !row.dismissed);
}

function toDashboardRow(status: PiDashStatus, panesById: Map<string, TmuxPane>, config: DashboardConfig, now: number): DashboardRow {
  const pane = status.paneId ? panesById.get(status.paneId) ?? null : null;
  const missingPane = Boolean(status.paneId) && !pane;
  const oldHeartbeat = now - status.heartbeatAt > config.staleAfterMs;
  const displayState = oldHeartbeat || missingPane ? "STALE" : status.state;
  const staleReason = oldHeartbeat ? "heartbeat expired" : missingPane ? "pane missing" : undefined;
  const currentStatus = { ...status, state: displayState };
  return {
    ...status,
    displayState,
    pane,
    staleReason,
    dismissed: isDismissedForCurrentEvent(status),
    actionable: displayState === status.state && isActionableStatus(currentStatus, config.actionableStates),
    unread: displayState === status.state && isUnreadStatus(currentStatus),
  };
}
