import { randomUUID } from "node:crypto";
import type { Database } from "./database.js";

export function createPresenceId(): string {
  return randomUUID();
}

export function writeDashboardPresence(db: Database, instanceId: string, tmuxPaneId: string | null, at = Date.now()): void {
  db.prepare(`
    INSERT INTO dashboard_presence (instance_id, pid, tmux_pane_id, started_at, heartbeat_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(instance_id) DO UPDATE SET pid=excluded.pid, tmux_pane_id=excluded.tmux_pane_id, heartbeat_at=excluded.heartbeat_at
  `).run(instanceId, process.pid, tmuxPaneId, at, at);
}

export function cleanupDashboardPresence(db: Database, staleAfterMs: number, at = Date.now()): void {
  db.prepare("DELETE FROM dashboard_presence WHERE heartbeat_at < ?").run(at - staleAfterMs);
}

export function hasFreshDashboardPresence(db: Database, staleAfterMs: number, at = Date.now()): boolean {
  cleanupDashboardPresence(db, staleAfterMs, at);
  const row = db.prepare("SELECT 1 FROM dashboard_presence WHERE heartbeat_at >= ? LIMIT 1").get(at - staleAfterMs);
  return Boolean(row);
}

export function removeDashboardPresence(db: Database, instanceId: string): void {
  db.prepare("DELETE FROM dashboard_presence WHERE instance_id = ?").run(instanceId);
}
