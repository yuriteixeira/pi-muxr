import { buildDashboardRows } from "../cli/rows.js";
import type { DashboardConfig, DashboardRow, PiMuxrState } from "../domain/status.js";
import type { Database } from "../state/database.js";
import { readStatuses } from "../state/read-statuses.js";
import { listTmuxPanes } from "../tmux/list-panes.js";

export interface WebDashboardRow {
  id: string;
  state: PiMuxrState;
  unread: boolean;
  actionable: boolean;
  summary: string;
  lastPrompt: string | null;
  cwd: string;
  tmuxSession: string | null;
  tmuxWindow: string | null;
  tmuxWindowIndex: string | null;
  paneId: string | null;
  lastEventAt: number;
  terminalPath: string | null;
}

export interface WebDashboardSnapshot {
  generatedAt: number;
  rows: WebDashboardRow[];
}

export function readWebDashboardSnapshot(
  db: Database,
  config: DashboardConfig,
  now = Date.now(),
): WebDashboardSnapshot {
  const rows = buildDashboardRows(readStatuses(db), listTmuxPanes(), config, now).map(toWebDashboardRow);
  return { generatedAt: now, rows };
}

export function toWebDashboardRow(row: DashboardRow): WebDashboardRow {
  return {
    id: row.id,
    state: row.displayState,
    unread: row.unread,
    actionable: row.actionable,
    summary: row.summary,
    lastPrompt: row.lastPrompt ?? null,
    cwd: row.cwd,
    tmuxSession: row.tmuxSession,
    tmuxWindow: row.tmuxWindow,
    tmuxWindowIndex: row.tmuxWindowIndex,
    paneId: row.paneId,
    lastEventAt: row.lastEventAt,
    terminalPath: buildTerminalPath(row),
  };
}

export function buildTerminalPath(row: Pick<DashboardRow, "paneId" | "tmuxSession">): string | null {
  if (!row.paneId || !row.tmuxSession) return null;
  const params = new URLSearchParams({ pane: row.paneId, session: row.tmuxSession });
  return `/terminal?${params.toString()}`;
}
