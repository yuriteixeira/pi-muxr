import { loadConfig } from "../config/config.js";
import type { DashboardConfig, PiDashState, PiDashStatus, TmuxPane } from "../domain/status.js";
import { DEFAULT_ACTIONABLE_STATES } from "../domain/status.js";
import { notifyStatus } from "../notifications/desktop.js";
import { openDatabase, type Database } from "../state/database.js";
import { hasFreshDashboardPresence } from "../state/dashboard-presence.js";
import { markNotified, removeStatus, updateHeartbeat, upsertStatus } from "../state/write-status.js";
import { listTmuxPanes } from "../tmux/list-panes.js";

interface RuntimeState {
  config: DashboardConfig;
  db: Database | null;
  id: string | null;
  heartbeatTimer: NodeJS.Timeout | null;
  lastError: string | null;
  model: string | null;
}

interface NotificationSnapshot {
  state: PiDashState;
  lastNotifiedEventAt: number | null;
}

export default function piDashExtension(pi: any): void {
  const runtime: RuntimeState = { config: loadConfig(), db: null, id: null, heartbeatTimer: null, lastError: null, model: null };

  pi.on("session_start", async (_event: unknown, ctx: any) => {
    runtime.config = loadConfig();
    runtime.db = openDatabase(runtime.config.databasePath);
    runtime.model = formatModel(ctx.model);
    runtime.id = createSessionId(ctx);
    writeState(runtime, ctx, "IDLE", "low", startSummary(ctx));
    runtime.heartbeatTimer = setInterval(() => writeHeartbeat(runtime, ctx), runtime.config.heartbeatIntervalMs);
  });

  pi.on("model_select", async (event: any, ctx: any) => {
    runtime.model = formatModel(event.model);
    writeState(runtime, ctx, "IDLE", "low", `model: ${runtime.model}`);
  });

  pi.on("agent_start", async (_event: unknown, ctx: any) => writeState(runtime, ctx, "RUN", "low", "agent started"));
  pi.on("turn_start", async (event: any, ctx: any) => writeState(runtime, ctx, "RUN", "low", `turn ${formatTurnIndex(event.turnIndex)} started`));
  pi.on("tool_execution_start", async (event: any, ctx: any) => handleToolExecutionStart(runtime, event, ctx));
  pi.on("tool_result", async (event: any, ctx: any) => handleToolResult(runtime, event, ctx));
  pi.on("agent_end", async (_event: unknown, ctx: any) => {
    if (runtime.lastError) {
      writeState(runtime, ctx, "ERROR", "high", runtime.lastError);
      runtime.lastError = null;
      return;
    }
    writeState(runtime, ctx, "DONE", "medium", "turn completed");
  });

  pi.on("session_shutdown", async (_event: unknown) => {
    if (runtime.heartbeatTimer) clearInterval(runtime.heartbeatTimer);
    if (runtime.db && runtime.id) removeStatus(runtime.db, runtime.id);
    runtime.db?.close();
    runtime.db = null;
  });
}

function writeHeartbeat(runtime: RuntimeState, _ctx: any): void {
  if (!runtime.db || !runtime.id) return;
  updateHeartbeat(runtime.db, runtime.id);
}

function handleToolExecutionStart(runtime: RuntimeState, event: any, ctx: any): void {
  if (event.toolName === "ask_user") {
    writeState(runtime, ctx, "ASK", "high", summarizeAskUserRequest(event.args ?? event.input));
    return;
  }

  writeState(runtime, ctx, "RUN", "low", `tool: ${event.toolName} ${summarizeArgs(event.args)}`);
}

function handleToolResult(runtime: RuntimeState, event: any, ctx: any): void {
  if (event.toolName === "ask_user" && !event.isError) {
    writeState(runtime, ctx, "RUN", "low", summarizeAskUserResult(event));
    return;
  }

  if (event.isError) runtime.lastError = `${event.toolName}: ${summarizeResult(event)}`;
}

function writeState(runtime: RuntimeState, ctx: any, state: PiDashState, severity: PiDashStatus["severity"], summary: string): void {
  if (!runtime.db || !runtime.id) return;
  const now = Date.now();
  const pane = currentPane();
  const status = baseStatus(runtime, ctx, pane, state, severity, summary, now, true);
  const notificationSnapshot = readNotificationSnapshot(runtime.db, status.id);
  upsertStatus(runtime.db, status);
  maybeNotify(runtime, status, notificationSnapshot);
}

function baseStatus(runtime: RuntimeState, ctx: any, pane: TmuxPane | null, state: PiDashState, severity: PiDashStatus["severity"], summary: string, now: number, event: boolean): PiDashStatus {
  return {
    id: runtime.id ?? createSessionId(ctx),
    paneId: pane?.paneId ?? process.env.TMUX_PANE ?? null,
    tmuxSession: pane?.sessionName ?? null,
    tmuxWindow: pane?.windowName ?? null,
    tmuxWindowIndex: pane?.windowIndex ?? null,
    pid: process.pid,
    cwd: ctx.cwd ?? process.cwd(),
    piSessionFile: getSessionFile(ctx),
    model: runtime.model ?? formatModel(ctx.model),
    state,
    severity,
    summary,
    lastEventAt: event ? now : now,
    heartbeatAt: now,
  };
}

function maybeNotify(runtime: RuntimeState, status: PiDashStatus, snapshot: NotificationSnapshot | null): void {
  if (!runtime.db || !runtime.config.desktopNotifications) return;
  if (!DEFAULT_ACTIONABLE_STATES.includes(status.state)) return;
  if (snapshot?.state === status.state) return;
  if (runtime.config.suppressDesktopNotificationsWhenDashboardOpen && hasFreshDashboardPresence(runtime.db, runtime.config.dashboardPresenceStaleAfterMs)) return;
  if ((snapshot?.lastNotifiedEventAt ?? 0) >= status.lastEventAt) return;
  notifyStatus(status);
  markNotified(runtime.db, status.id, status.lastEventAt);
}

function readNotificationSnapshot(db: Database, id: string): NotificationSnapshot | null {
  const row = db.prepare("SELECT state, last_notified_event_at FROM sessions WHERE id = ?").get(id) as { state?: PiDashState; last_notified_event_at?: number | null } | undefined;
  if (!row?.state) return null;
  return { state: row.state, lastNotifiedEventAt: row.last_notified_event_at ?? null };
}

function createSessionId(ctx: any): string {
  const file = getSessionFile(ctx);
  const pane = process.env.TMUX_PANE;
  return [file ?? `pid:${process.pid}`, pane].filter(Boolean).join(":");
}

function getSessionFile(ctx: any): string | null {
  try { return ctx.sessionManager?.getSessionFile?.() ?? null; } catch { return null; }
}

function currentPane(): TmuxPane | null {
  const paneId = process.env.TMUX_PANE;
  if (!paneId) return null;
  return listTmuxPanes().find((pane) => pane.paneId === paneId) ?? null;
}

function formatModel(model: any): string | null {
  if (!model) return null;
  if (typeof model === "string") return model;
  if (model.provider && model.id) return `${model.provider}/${model.id}`;
  return model.id ?? model.name ?? null;
}

function startSummary(ctx: any): string {
  const model = formatModel(ctx.model);
  return model ? `session started (${model})` : "session started";
}

function formatTurnIndex(turnIndex: unknown): string {
  return typeof turnIndex === "number" ? String(turnIndex + 1) : "?";
}

function summarizeAskUserRequest(input: unknown): string {
  const question = extractAskQuestion(input);
  return question ? `ask_user: ${truncate(question, 180)}` : "ask_user: waiting for input";
}

function summarizeAskUserResult(event: any): string {
  if (event.details?.cancelled) return "ask_user: cancelled";
  const response = event.details?.response;
  if (response?.kind === "selection" && Array.isArray(response.selections)) return `ask_user answered: ${truncate(response.selections.join(", "), 160)}`;
  if (response?.kind === "freeform" && typeof response.text === "string") return `ask_user answered: ${truncate(response.text, 160)}`;
  return "ask_user answered";
}

function extractAskQuestion(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const question = (input as { question?: unknown }).question;
  return typeof question === "string" && question.trim() ? question.trim() : null;
}

function summarizeArgs(args: unknown): string {
  try { return truncate(JSON.stringify(args), 120); } catch { return ""; }
}

function summarizeResult(event: any): string {
  if (typeof event.content === "string") return truncate(event.content, 200);
  try { return truncate(JSON.stringify(event.content ?? event.details ?? {}), 200); } catch { return "tool failed"; }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
