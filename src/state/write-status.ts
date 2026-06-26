import type { PiDashState, PiDashStatus } from "../domain/status.js";
import { DEFAULT_ACTIONABLE_STATES } from "../domain/status.js";
import type { Database } from "./database.js";

export type StatusInput = Omit<PiDashStatus, "readUntilEventAt" | "acknowledgedAt" | "dismissedUntilEventAt" | "lastNotifiedEventAt"> & Partial<Pick<PiDashStatus, "readUntilEventAt" | "acknowledgedAt" | "dismissedUntilEventAt" | "lastNotifiedEventAt">>;

export function upsertStatus(db: Database, status: StatusInput): void {
  db.prepare(`
    INSERT INTO sessions (id, pane_id, tmux_session, tmux_window, tmux_window_index, pid, cwd, pi_session_file, model, state, severity, summary, last_event_at, heartbeat_at, read_until_event_at, acknowledged_at, dismissed_until_event_at, last_notified_event_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      pane_id=excluded.pane_id,
      tmux_session=excluded.tmux_session,
      tmux_window=excluded.tmux_window,
      tmux_window_index=excluded.tmux_window_index,
      pid=excluded.pid,
      cwd=excluded.cwd,
      pi_session_file=excluded.pi_session_file,
      model=excluded.model,
      state=excluded.state,
      severity=excluded.severity,
      summary=excluded.summary,
      last_event_at=excluded.last_event_at,
      heartbeat_at=excluded.heartbeat_at,
      read_until_event_at=COALESCE(sessions.read_until_event_at, excluded.read_until_event_at),
      acknowledged_at=COALESCE(sessions.acknowledged_at, excluded.acknowledged_at),
      dismissed_until_event_at=COALESCE(sessions.dismissed_until_event_at, excluded.dismissed_until_event_at),
      last_notified_event_at=COALESCE(sessions.last_notified_event_at, excluded.last_notified_event_at)
  `).run(status.id, status.paneId, status.tmuxSession, status.tmuxWindow, status.tmuxWindowIndex, status.pid, status.cwd, status.piSessionFile, status.model, status.state, status.severity, truncate(status.summary, 500), status.lastEventAt, status.heartbeatAt, status.readUntilEventAt ?? null, status.acknowledgedAt ?? null, status.dismissedUntilEventAt ?? null, status.lastNotifiedEventAt ?? null);
}

export function removeStatus(db: Database, id: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(id);
}

export function updateHeartbeat(db: Database, id: string, heartbeatAt = Date.now()): void {
  db.prepare("UPDATE sessions SET heartbeat_at = ? WHERE id = ?").run(heartbeatAt, id);
}

export function markRead(db: Database, id: string, lastEventAt: number): void {
  db.prepare("UPDATE sessions SET read_until_event_at = ? WHERE id = ?").run(lastEventAt, id);
}

export function dismissStatus(db: Database, id: string, lastEventAt: number, at = Date.now()): void {
  db.prepare("UPDATE sessions SET dismissed_until_event_at = ?, acknowledged_at = ? WHERE id = ?").run(lastEventAt, at, id);
}

export function dismissAllRead(db: Database, actionableStatesOrAt: PiDashState[] | number = DEFAULT_ACTIONABLE_STATES, at = Date.now()): number {
  const actionableStates = Array.isArray(actionableStatesOrAt) ? actionableStatesOrAt : DEFAULT_ACTIONABLE_STATES;
  const acknowledgedAt = Array.isArray(actionableStatesOrAt) ? at : actionableStatesOrAt;
  if (actionableStates.length === 0) return 0;
  const placeholders = actionableStates.map(() => "?").join(", ");
  const result = db.prepare(`
    UPDATE sessions
    SET dismissed_until_event_at = last_event_at, acknowledged_at = ?
    WHERE state IN (${placeholders})
      AND COALESCE(read_until_event_at, 0) >= last_event_at
      AND COALESCE(dismissed_until_event_at, 0) < last_event_at
  `).run(acknowledgedAt, ...actionableStates);
  return Number(result.changes ?? 0);
}

export function markNotified(db: Database, id: string, lastEventAt: number): void {
  db.prepare("UPDATE sessions SET last_notified_event_at = ? WHERE id = ?").run(lastEventAt, id);
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
