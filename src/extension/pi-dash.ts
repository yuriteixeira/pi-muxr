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
  handledToolCallIds: Set<string>;
  hasToolPreviewInPrompt: boolean;
}

interface NotificationSnapshot {
  state: PiDashState;
  lastNotifiedEventAt: number | null;
}

export default function piDashExtension(pi: any): void {
  const runtime: RuntimeState = { config: loadConfig(), db: null, id: null, heartbeatTimer: null, lastError: null, model: null, handledToolCallIds: new Set(), hasToolPreviewInPrompt: false };

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

  pi.on("agent_start", async (_event: unknown, ctx: any) => {
    runtime.lastError = null;
    runtime.handledToolCallIds.clear();
    runtime.hasToolPreviewInPrompt = false;
    writeState(runtime, ctx, "RUN", "low", "agent started");
  });
  pi.on("turn_start", async (event: any, ctx: any) => handleTurnStart(runtime, event, ctx));
  pi.on("tool_call", async (event: any, ctx: any) => handleToolCall(runtime, event, ctx));
  pi.on("tool_execution_start", async (event: any, ctx: any) => handleToolCall(runtime, event, ctx));
  pi.on("tool_result", async (event: any, ctx: any) => handleToolResult(runtime, event, ctx));
  pi.on("agent_end", async (event: unknown, ctx: any) => {
    const status = resolveAgentEndStatus(event, runtime.lastError);
    writeState(runtime, ctx, status.state, status.severity, status.summary);
    runtime.lastError = null;
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

function handleTurnStart(runtime: RuntimeState, event: any, ctx: any): void {
  if (runtime.hasToolPreviewInPrompt) {
    writeHeartbeat(runtime, ctx);
    return;
  }

  writeState(runtime, ctx, "RUN", "low", `turn ${formatTurnIndex(event.turnIndex)} started`);
}

function handleToolCall(runtime: RuntimeState, event: any, ctx: any): void {
  const toolCallId = typeof event.toolCallId === "string" ? event.toolCallId : null;
  if (toolCallId && runtime.handledToolCallIds.has(toolCallId)) return;
  if (toolCallId) runtime.handledToolCallIds.add(toolCallId);
  runtime.hasToolPreviewInPrompt = true;

  const input = event.input ?? event.args;
  if (event.toolName === "ask_user") {
    writeState(runtime, ctx, "ASK", "high", summarizeAskUserRequest(input));
    return;
  }

  writeState(runtime, ctx, "RUN", "low", summarizeToolCall(event.toolName, input));
}

function handleToolResult(runtime: RuntimeState, event: any, ctx: any): void {
  if (event.toolName === "ask_user" && event.isError !== true) {
    runtime.lastError = null;
    writeState(runtime, ctx, "RUN", "low", summarizeAskUserResult(event));
    return;
  }

  runtime.lastError = event.isError === true ? `${formatToolName(event.toolName)} ${summarizeResult(event)}` : null;
}

export function resolveAgentEndStatus(event: unknown, fallbackError: string | null): Pick<PiDashStatus, "state" | "severity" | "summary"> {
  const failure = summarizeAgentEndFailure(event);
  if (failure) return { state: "ERROR", severity: "high", summary: failure };
  if (!hasAgentEndMessages(event) && fallbackError) return { state: "ERROR", severity: "high", summary: fallbackError };
  return { state: "DONE", severity: "medium", summary: "turn completed" };
}

function summarizeAgentEndFailure(event: unknown): string | null {
  const messages = getAgentEndMessages(event);
  if (!messages) return null;

  const assistant = findLastMessageByRole(messages, "assistant");
  if (isRecord(assistant) && (assistant.stopReason === "error" || assistant.stopReason === "aborted")) {
    return typeof assistant.errorMessage === "string" && assistant.errorMessage.trim() ? truncate(assistant.errorMessage.trim(), 200) : `assistant ${assistant.stopReason}`;
  }

  const lastMessage = messages.at(-1);
  if (isRecord(lastMessage) && lastMessage.role === "toolResult" && lastMessage.isError === true) {
    const toolName = typeof lastMessage.toolName === "string" ? lastMessage.toolName : "tool";
    return `${formatToolName(toolName)} ${summarizeResult(lastMessage)}`;
  }

  return null;
}

function hasAgentEndMessages(event: unknown): boolean {
  return Array.isArray((event as { messages?: unknown } | null)?.messages);
}

function getAgentEndMessages(event: unknown): unknown[] | null {
  const messages = (event as { messages?: unknown } | null)?.messages;
  return Array.isArray(messages) ? messages : null;
}

function findLastMessageByRole(messages: unknown[], role: string): unknown {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (isRecord(message) && message.role === role) return message;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
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

export function summarizeAskUserRequest(input: unknown): string {
  const question = extractAskQuestion(input);
  return question ? `${formatToolName("ask_user")} ${truncate(question, 180)}` : `${formatToolName("ask_user")} waiting for input`;
}

export function summarizeAskUserResult(event: any): string {
  if (event.details?.cancelled) return `${formatToolName("ask_user")} cancelled`;
  const response = event.details?.response;
  if (response?.kind === "selection" && Array.isArray(response.selections)) return `${formatToolName("ask_user")} answered: ${truncate(response.selections.join(", "), 160)}`;
  if (response?.kind === "freeform" && typeof response.text === "string") return `${formatToolName("ask_user")} answered: ${truncate(response.text, 160)}`;
  return `${formatToolName("ask_user")} answered`;
}

function extractAskQuestion(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const question = (input as { question?: unknown }).question;
  return typeof question === "string" && question.trim() ? question.trim() : null;
}

export function formatToolName(toolName: unknown): string {
  return `[${typeof toolName === "string" ? toolName : "tool"}]`;
}

export function summarizeToolCall(toolName: unknown, input: unknown): string {
  return `${formatToolName(toolName)}${summarizeToolInput(toolName, input)}`;
}

function summarizeToolInput(toolName: unknown, input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const record = input as Record<string, unknown>;
  if (toolName === "bash" && typeof record.command === "string") return ` ${truncate(record.command, 160)}`;
  if (typeof record.path === "string") return ` ${truncate(record.path, 160)}`;
  if (typeof record.url === "string") return ` ${truncate(record.url, 160)}`;
  if (typeof record.query === "string") return ` ${truncate(record.query, 160)}`;
  try { return ` ${truncate(JSON.stringify(input), 120)}`; } catch { return ""; }
}

function summarizeResult(event: any): string {
  if (typeof event.content === "string") return truncate(event.content, 200);
  try { return truncate(JSON.stringify(event.content ?? event.details ?? {}), 200); } catch { return "tool failed"; }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
