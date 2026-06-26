import { stdin as input, stdout as output } from "node:process";
import { loadConfig } from "../config/config.js";
import type { DashboardConfig, DashboardRow } from "../domain/status.js";
import { openDatabase, type Database } from "../state/database.js";
import { createPresenceId, removeDashboardPresence, writeDashboardPresence } from "../state/dashboard-presence.js";
import { readStatuses } from "../state/read-statuses.js";
import { dismissAllRead, dismissStatus, markRead } from "../state/write-status.js";
import { focusPane } from "../tmux/focus.js";
import { listTmuxPanes } from "../tmux/list-panes.js";
import { renderRows } from "./format.js";
import { buildDashboardRows } from "./rows.js";

interface DashboardState { rows: DashboardRow[]; selected: number; seenEvents: Set<string>; }

export function runDashboard(): void {
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  const presenceId = createPresenceId();
  const state: DashboardState = { rows: [], selected: 0, seenEvents: new Set() };
  const refreshTimer = setInterval(() => refresh(db, config, state, true), 2_000);
  const presenceTimer = setInterval(() => writeDashboardPresence(db, presenceId, process.env.TMUX_PANE ?? null), config.dashboardPresenceIntervalMs);

  setupTerminal();
  writeDashboardPresence(db, presenceId, process.env.TMUX_PANE ?? null);
  refresh(db, config, state, false);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearInterval(refreshTimer); clearInterval(presenceTimer);
    removeDashboardPresence(db, presenceId);
    teardownTerminal(); db.close();
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  input.on("data", (chunk) => handleKey(chunk, db, config, state));
}

function refresh(db: Database, config: DashboardConfig, state: DashboardState, beep: boolean): void {
  state.rows = buildDashboardRows(readStatuses(db), listTmuxPanes(), config);
  state.selected = Math.min(state.selected, Math.max(0, state.rows.length - 1));
  if (beep && config.dashboardBell) beepForNewEvents(state);
  render(state);
}

function beepForNewEvents(state: DashboardState): void {
  for (const row of state.rows) {
    const key = `${row.id}:${row.lastEventAt}`;
    if (row.actionable && row.unread && !row.dismissed && !state.seenEvents.has(key)) {
      output.write("\x07");
      state.seenEvents.add(key);
    }
  }
}

function render(state: DashboardState): void {
  output.write("\x1b[2J\x1b[H");
  output.write("pi-dash  Enter: focus/read  d/k: dismiss  D: dismiss read  r: refresh  q: quit\n\n");
  output.write(renderRows(state.rows, state.selected));
  output.write("\n");
}

function handleKey(chunk: Buffer | string, db: Database, config: DashboardConfig, state: DashboardState): void {
  const key = chunk.toString();
  if (key === "q" || key === "\u0003") process.exit(0);
  if (key === "\u001b[A") state.selected = Math.max(0, state.selected - 1);
  else if (key === "\u001b[B") state.selected = Math.min(Math.max(0, state.rows.length - 1), state.selected + 1);
  else if (key === "r") refresh(db, config, state, false);
  else if (key === "d" || key === "k") dismissSelected(db, state);
  else if (key === "D") dismissAllRead(db);
  else if (key === "\r" || key === "\n") focusSelected(db, state);
  refresh(db, config, state, false);
}

function dismissSelected(db: Database, state: DashboardState): void {
  const row = state.rows[state.selected];
  if (row) dismissStatus(db, row.id, row.lastEventAt);
}

function focusSelected(db: Database, state: DashboardState): void {
  const row = state.rows[state.selected];
  if (!row) return;
  markRead(db, row.id, row.lastEventAt);
  if (!row.pane) return;
  const commands = focusPane(row.pane);
  if (!process.env.TMUX) output.write(`\nNot inside tmux. Run:\n${commands.join("\n")}\n`);
}

function setupTerminal(): void {
  if (input.isTTY) input.setRawMode(true);
  input.resume();
  output.write("\x1b[?25l");
}

function teardownTerminal(): void {
  output.write("\x1b[?25h\x1b[0m\n");
  if (input.isTTY) input.setRawMode(false);
}
