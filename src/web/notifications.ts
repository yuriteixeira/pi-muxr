import type { DashboardConfig, DashboardRow } from "../domain/status.js";
import { formatNotification } from "../notifications/format.js";
import type { Database } from "../state/database.js";
import { readStatuses } from "../state/read-statuses.js";
import { listTmuxPanes } from "../tmux/list-panes.js";
import { buildDashboardRows } from "../cli/rows.js";
import type { NotificationRow, ServerMessage } from "./protocol.js";

export interface NotificationMonitor {
  poll(): ServerMessage[];
}

export function createNotificationMonitor(db: Database, config: DashboardConfig): NotificationMonitor {
  const seen = new Set<string>();
  seedSeenEvents(seen, readActionableRows(db, config));
  return { poll: () => pollNotifications(db, config, seen) };
}

function pollNotifications(db: Database, config: DashboardConfig, seen: Set<string>): ServerMessage[] {
  const messages: ServerMessage[] = [];
  for (const row of readActionableRows(db, config)) {
    const key = eventKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    messages.push({
      type: "notification",
      ...formatNotification(row),
      row: notificationRow(row),
    });
  }
  return messages;
}

function readActionableRows(db: Database, config: DashboardConfig): DashboardRow[] {
  return buildDashboardRows(readStatuses(db), listTmuxPanes(), config).filter(
    (row) => row.actionable && row.unread && !row.dismissed,
  );
}

function seedSeenEvents(seen: Set<string>, rows: DashboardRow[]): void {
  for (const row of rows) seen.add(eventKey(row));
}

function eventKey(row: DashboardRow): string {
  return `${row.id}:${row.lastEventAt}`;
}

function notificationRow(row: DashboardRow): NotificationRow {
  return {
    id: row.id,
    state: row.state,
    severity: row.severity,
    summary: row.summary,
    cwd: row.cwd,
    tmuxSession: row.tmuxSession,
    tmuxWindowIndex: row.tmuxWindowIndex,
    paneId: row.paneId,
    lastEventAt: row.lastEventAt,
  };
}
