import type { PiMuxrStatus } from "../domain/status.js";

type DbSessionRow = {
  id: string;
  pane_id: string | null;
  tmux_session: string | null;
  tmux_window: string | null;
  tmux_window_index: string | null;
  pid: number;
  cwd: string;
  pi_session_file: string | null;
  model: string | null;
  state: PiMuxrStatus["state"];
  severity: PiMuxrStatus["severity"];
  summary: string;
  last_prompt: string | null;
  last_event_at: number;
  heartbeat_at: number;
  read_until_event_at: number | null;
  acknowledged_at: number | null;
  dismissed_until_event_at: number | null;
  last_notified_event_at: number | null;
};

export function toStatus(row: DbSessionRow): PiMuxrStatus {
  return {
    id: row.id,
    paneId: row.pane_id,
    tmuxSession: row.tmux_session,
    tmuxWindow: row.tmux_window,
    tmuxWindowIndex: row.tmux_window_index,
    pid: row.pid,
    cwd: row.cwd,
    piSessionFile: row.pi_session_file,
    model: row.model,
    state: row.state,
    severity: row.severity,
    summary: row.summary,
    lastPrompt: row.last_prompt,
    lastEventAt: row.last_event_at,
    heartbeatAt: row.heartbeat_at,
    readUntilEventAt: row.read_until_event_at,
    acknowledgedAt: row.acknowledged_at,
    dismissedUntilEventAt: row.dismissed_until_event_at,
    lastNotifiedEventAt: row.last_notified_event_at,
  };
}
