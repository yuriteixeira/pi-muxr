import { ProcessTerminal, TuiAltScreen, type TUI } from "@earendil-works/pi-tui";
import { loadConfig } from "../config/config.js";
import type { DashboardConfig, DashboardRow, TmuxPane } from "../domain/status.js";
import { createPresenceId, removeDashboardPresence, writeDashboardPresence } from "../state/dashboard-presence.js";
import { openDatabase, type Database } from "../state/database.js";
import { readStatuses } from "../state/read-statuses.js";
import { dismissAllRead, dismissStatus, markRead } from "../state/write-status.js";
import { focusPane } from "../tmux/focus.js";
import { listTmuxPanes } from "../tmux/list-panes.js";
import { DashboardComponent, type DashboardActions } from "./dashboard-component.js";
import { RUN_SPINNER_INTERVAL_MS } from "./dashboard-icons.js";
import { buildDashboardRows } from "./rows.js";

export interface DashboardOptions {
  quitOnSelect?: boolean;
}

interface DashboardState {
  rows: DashboardRow[];
  selected: number;
  message: string | null;
}

interface DashboardRuntime {
  config: DashboardConfig;
  db: Database;
  presenceId: string;
  state: DashboardState;
  terminal: ProcessTerminal;
  tui: TUI;
  component: DashboardComponent;
  quitOnSelect: boolean;
  refreshTimer: NodeJS.Timeout;
  presenceTimer: NodeJS.Timeout;
  animationTimer: NodeJS.Timeout;
  cleaned: boolean;
}

export function runDashboard(options: DashboardOptions = {}): void {
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  const presenceId = createPresenceId();
  const state: DashboardState = { rows: [], selected: 0, message: null };
  const terminal = new ProcessTerminal();
  const tui = new TuiAltScreen(terminal);
  let runtime: DashboardRuntime;

  const actions = createDashboardActions(() => runtime);
  const component = new DashboardComponent(actions, () => terminal.rows);
  runtime = {
    config,
    db,
    presenceId,
    state,
    terminal,
    tui,
    component,
    quitOnSelect: options.quitOnSelect ?? false,
    refreshTimer: setInterval(() => refresh(runtime), 1_000),
    presenceTimer: setInterval(() => writeDashboardPresence(db, presenceId, process.env.TMUX_PANE ?? null), config.dashboardPresenceIntervalMs),
    animationTimer: setInterval(() => renderAnimationFrame(runtime), RUN_SPINNER_INTERVAL_MS),
    cleaned: false,
  };

  tui.addChild(component);
  tui.setFocus(component);
  writeDashboardPresence(db, presenceId, process.env.TMUX_PANE ?? null);
  refresh(runtime);
  tui.start();

  const cleanupHandler = () => cleanup(runtime);
  const sigintHandler = () => { cleanup(runtime); process.exit(0); };
  process.on("exit", cleanupHandler);
  process.on("SIGINT", sigintHandler);
}

function createDashboardActions(getRuntime: () => DashboardRuntime): DashboardActions {
  return {
    moveSelection: (delta) => moveSelection(getRuntime(), delta),
    selectFirst: () => selectFirst(getRuntime()),
    selectLast: () => selectLast(getRuntime()),
    refresh: () => refreshFromInput(getRuntime()),
    focusSelected: () => focusSelectedFromInput(getRuntime()),
    dismissSelected: () => dismissSelectedFromInput(getRuntime()),
    dismissAllRead: () => dismissAllReadFromInput(getRuntime()),
    quit: () => quit(getRuntime()),
  };
}

function cleanup(runtime: DashboardRuntime): void {
  if (runtime.cleaned) return;
  runtime.cleaned = true;
  clearInterval(runtime.refreshTimer);
  clearInterval(runtime.presenceTimer);
  clearInterval(runtime.animationTimer);
  removeDashboardPresence(runtime.db, runtime.presenceId);
  runtime.tui.stop();
  runtime.db.close();
}

function refresh(runtime: DashboardRuntime): void {
  runtime.state.rows = buildDashboardRows(readStatuses(runtime.db), listTmuxPanes(), runtime.config);
  clampSelection(runtime.state);
  render(runtime);
}

function render(runtime: DashboardRuntime): void {
  runtime.component.setSnapshot({ rows: runtime.state.rows, selected: runtime.state.selected, message: runtime.state.message });
  runtime.tui.requestRender();
}

function renderAnimationFrame(runtime: DashboardRuntime): void {
  if (!runtime.state.rows.some((row) => row.displayState === "RUN")) return;
  runtime.component.invalidate();
  runtime.tui.requestRender();
}

function moveSelection(runtime: DashboardRuntime, delta: number): void {
  runtime.state.message = null;
  const lastIndex = Math.max(0, runtime.state.rows.length - 1);
  runtime.state.selected = Math.min(lastIndex, Math.max(0, runtime.state.selected + delta));
  render(runtime);
}

function selectFirst(runtime: DashboardRuntime): void {
  runtime.state.message = null;
  runtime.state.selected = 0;
  render(runtime);
}

function selectLast(runtime: DashboardRuntime): void {
  runtime.state.message = null;
  runtime.state.selected = Math.max(0, runtime.state.rows.length - 1);
  render(runtime);
}

function refreshFromInput(runtime: DashboardRuntime): void {
  runtime.state.message = null;
  refresh(runtime);
}

function dismissSelectedFromInput(runtime: DashboardRuntime): void {
  runtime.state.message = null;
  dismissSelected(runtime.db, runtime.state);
  refresh(runtime);
}

function dismissAllReadFromInput(runtime: DashboardRuntime): void {
  runtime.state.message = null;
  dismissAllRead(runtime.db, runtime.config.actionableStates);
  refresh(runtime);
}

function focusSelectedFromInput(runtime: DashboardRuntime): void {
  runtime.state.message = null;
  const rowSelected = focusSelected(runtime.db, runtime.state);
  if (rowSelected && runtime.quitOnSelect) {
    quit(runtime);
    return;
  }
  refresh(runtime);
}

function quit(runtime: DashboardRuntime): void {
  cleanup(runtime);
  process.exit(0);
}

function clampSelection(state: DashboardState): void {
  state.selected = Math.min(state.selected, Math.max(0, state.rows.length - 1));
}

function dismissSelected(db: Database, state: DashboardState): void {
  const row = state.rows[state.selected];
  if (row) dismissStatus(db, row.id, row.lastEventAt);
}

function focusSelected(db: Database, state: DashboardState): boolean {
  const row = state.rows[state.selected];
  if (!row) return false;
  markRead(db, row.id, row.lastEventAt);

  const pane = findPaneForFocus(row);
  if (!pane) {
    state.message = `Pane ${row.paneId ?? "?"} is no longer available. Refresh marks this row as STALE.`;
    return true;
  }

  try {
    const commands = focusPane(pane);
    if (!process.env.TMUX) state.message = `Not inside tmux. Run:\n${commands.join("\n")}`;
  } catch (error) {
    state.message = `Failed to focus ${pane.paneId}: ${formatError(error)}`;
  }
  return true;
}

function findPaneForFocus(row: DashboardRow): TmuxPane | null {
  const paneId = row.pane?.paneId ?? row.paneId;
  if (!paneId) return null;
  return listTmuxPanes().find((pane) => pane.paneId === paneId) ?? null;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
