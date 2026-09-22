import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { visibleWidth } from "@earendil-works/pi-tui";
import { DEFAULT_CONFIG } from "../src/config/config.ts";
import { isActionableStatus, isUnreadStatus, type PiDashStatus } from "../src/domain/status.ts";
import { openDatabase } from "../src/state/database.ts";
import { readStatuses } from "../src/state/read-statuses.ts";
import { dismissAllRead, dismissStatus, markRead, upsertStatus } from "../src/state/write-status.ts";
import { parseTmuxPanes } from "../src/tmux/list-panes.ts";
import { renderDashboardLines } from "../src/cli/dashboard-component.ts";
import { getStateIcon } from "../src/cli/dashboard-icons.ts";
import { renderRows } from "../src/cli/format.ts";
import { chooseDashboardLayout } from "../src/cli/dashboard-layout.ts";
import { DEFAULT_DASHBOARD_THEME } from "../src/cli/dashboard-theme.ts";
import { buildDashboardRows } from "../src/cli/rows.ts";
import { formatToolName, resolveAgentEndStatus, summarizeAskUserRequest, summarizeAskUserResult, summarizeToolCall } from "../src/extension/pi-dash.ts";

test("actionable/read/dismissed calculation", () => {
  const status = { state: "DONE", lastEventAt: 10 } as const;
  assert.equal(isActionableStatus(status), true);
  assert.equal(isUnreadStatus(status), true);
  assert.equal(isUnreadStatus({ ...status, readUntilEventAt: 10 }), false);
  assert.equal(isActionableStatus({ ...status, dismissedUntilEventAt: 10 }), false);
});

test("tmux parser", () => {
  const panes = parseTmuxPanes("work\t1\tapi\t%14\t1\tbash\ttitle\t123\n");
  assert.deepEqual(panes[0], { sessionName: "work", windowIndex: "1", windowName: "api", paneId: "%14", paneActive: true, currentCommand: "bash", paneTitle: "title", panePid: 123 });
});

test("sqlite status markers", () => {
  const db = openDatabase(join(mkdtempSync(join(tmpdir(), "pi-dash-")), "db.sqlite"));
  const status: PiDashStatus = { id: "1", paneId: "%1", tmuxSession: "s", tmuxWindow: "w", tmuxWindowIndex: "0", pid: 1, cwd: "/tmp/project", piSessionFile: null, model: null, state: "DONE", severity: "medium", summary: "done", lastEventAt: 100, heartbeatAt: 100 };
  upsertStatus(db, status);
  markRead(db, "1", 100);
  assert.equal(readStatuses(db)[0]?.readUntilEventAt, 100);
  assert.equal(dismissAllRead(db), 1);
  assert.equal(readStatuses(db)[0]?.dismissedUntilEventAt, 100);
  dismissStatus(db, "1", 100);
  db.close();
});

test("dismiss all read honors configured actionable states", () => {
  const db = openDatabase(join(mkdtempSync(join(tmpdir(), "pi-dash-")), "db.sqlite"));
  const status: PiDashStatus = { id: "1", paneId: "%1", tmuxSession: "s", tmuxWindow: "w", tmuxWindowIndex: "0", pid: 1, cwd: "/tmp/project", piSessionFile: null, model: null, state: "RUN", severity: "low", summary: "run", lastEventAt: 100, heartbeatAt: 100, readUntilEventAt: 100 };
  upsertStatus(db, status);
  assert.equal(dismissAllRead(db), 0);
  assert.equal(dismissAllRead(db, ["RUN"]), 1);
  assert.equal(readStatuses(db)[0]?.dismissedUntilEventAt, 100);
  db.close();
});

test("dashboard rows only include active sessions and hide dismissed rows", () => {
  const status: PiDashStatus = { id: "1", paneId: "%missing", tmuxSession: null, tmuxWindow: null, tmuxWindowIndex: null, pid: 1, cwd: "/tmp/project", piSessionFile: null, model: null, state: "DONE", severity: "medium", summary: "done", lastEventAt: 100, heartbeatAt: 100 };
  const rows = buildDashboardRows([status], [], { ...DEFAULT_CONFIG, showDismissedRows: false }, 100_000);
  assert.equal(rows.length, 0);

  const dismissedRows = buildDashboardRows([{ ...status, dismissedUntilEventAt: 100 }], [], { ...DEFAULT_CONFIG, showDismissedRows: false }, 100_000);
  assert.equal(dismissedRows.length, 0);
});

test("extension wraps tool names in square brackets without a trailing colon", () => {
  assert.equal(formatToolName("bash"), "[bash]");
  assert.equal(summarizeToolCall("bash", { command: "pnpm test" }), "[bash] pnpm test");
  assert.equal(summarizeToolCall("read", { path: "README.md" }), "[read] README.md");
  assert.equal(summarizeAskUserRequest({ question: "Continue?" }), "[ask_user] Continue?");
  assert.equal(summarizeAskUserRequest({}), "[ask_user] waiting for input");
  assert.equal(summarizeAskUserResult({ details: { cancelled: true } }), "[ask_user] cancelled");
  assert.equal(summarizeAskUserResult({ details: { response: { kind: "selection", selections: ["Yes"] } } }), "[ask_user] answered: Yes");
});

test("extension reports DONE when agent recovered from a tool error", () => {
  const status = resolveAgentEndStatus({ messages: [
    { role: "toolResult", toolName: "bash", isError: true, content: [{ type: "text", text: "exit 1" }] },
    { role: "assistant", stopReason: "stop", content: [{ type: "text", text: "handled" }] },
  ] }, "bash: exit 1");

  assert.deepEqual(status, { state: "DONE", severity: "medium", summary: "turn completed" });
});

test("extension reports ERROR for failed final agent message", () => {
  const status = resolveAgentEndStatus({ messages: [
    { role: "assistant", stopReason: "error", errorMessage: "provider failed" },
  ] }, null);

  assert.deepEqual(status, { state: "ERROR", severity: "high", summary: "provider failed" });
});

test("modern dashboard maps states to nerd font icons", () => {
  assert.equal(getStateIcon("ASK"), "");
  assert.equal(getStateIcon("ERROR"), "");
  assert.equal(getStateIcon("DONE"), "");
  assert.equal(getStateIcon("RUN"), "");
  assert.equal(getStateIcon("QUEUED"), "󰔟");
  assert.equal(getStateIcon("IDLE"), "󰒲");
  assert.equal(getStateIcon("STALE"), "󰅖");
});

test("modern dashboard uses named Base16 roles with ANSI 16 colors", () => {
  assert.equal(DEFAULT_DASHBOARD_THEME.palette.base0D, 12);
  assert.equal(DEFAULT_DASHBOARD_THEME.accent("x"), "\x1b[94mx\x1b[39m");
  assert.equal(DEFAULT_DASHBOARD_THEME.surface("x"), "x");
  assert.equal(DEFAULT_DASHBOARD_THEME.selectedSurface("x"), "x");

  const { palette: _palette, ...roles } = DEFAULT_DASHBOARD_THEME;
  const renderedRoles = Object.values(roles).map((style) => style("x")).join("");
  assert.doesNotMatch(renderedRoles, /\x1b\[(?:38|48);(?:2|5);/);
});

test("modern dashboard selects responsive layout modes", () => {
  assert.equal(chooseDashboardLayout(140), "wide");
  assert.equal(chooseDashboardLayout(90), "medium");
  assert.equal(chooseDashboardLayout(60), "narrow");
});

test("modern dashboard render lines fit the provided width", () => {
  const status: PiDashStatus = { id: "1", paneId: "%1", tmuxSession: "main", tmuxWindow: "api", tmuxWindowIndex: "2", pid: 1, cwd: "/tmp/project", piSessionFile: null, model: null, state: "ASK", severity: "high", summary: "Need permission to edit a very long config path before continuing", lastEventAt: 1_000, heartbeatAt: 1_000 };
  const rows = buildDashboardRows([status], [parseTmuxPanes("main\t2\tapi\t%1\t1\tbash\ttitle\t123\n")[0]!], DEFAULT_CONFIG, 2_000);

  for (const width of [60, 90, 130]) {
    const lines = renderDashboardLines({ rows, selected: 0, message: "Saved", width, height: 12, now: 2_000 });
    assert.ok(lines.length <= 12);
    assert.ok(lines.every((line) => visibleWidth(line) <= width), `line exceeded width ${width}: ${lines.join("\n")}`);
  }
});

test("dashboard hides the status section when the terminal is too small", () => {
  const shortDashboard = renderDashboardLines({ rows: [], selected: 0, message: null, width: 90, height: 7, now: 2_000 }).join("\n");
  const narrowDashboard = renderDashboardLines({ rows: [], selected: 0, message: null, width: 60, height: 12, now: 2_000 }).join("\n");
  const largeDashboard = renderDashboardLines({ rows: [], selected: 0, message: null, width: 90, height: 8, now: 2_000 }).join("\n");

  for (const dashboard of [shortDashboard, narrowDashboard]) {
    assert.doesNotMatch(dashboard, /status/);
    assert.doesNotMatch(dashboard, /select.*focus/);
  }
  assert.match(largeDashboard, /status/);
  assert.match(largeDashboard, /select.*focus/);
});

test("selected rows preserve the status color", () => {
  const status: PiDashStatus = { id: "1", paneId: null, tmuxSession: "main", tmuxWindow: null, tmuxWindowIndex: null, pid: 1, cwd: "/tmp/project", piSessionFile: null, model: null, state: "DONE", severity: "medium", summary: "Done", lastEventAt: 1_000, heartbeatAt: 1_000 };
  const rows = buildDashboardRows([status], [], DEFAULT_CONFIG, 2_000);
  const selectedLine = renderDashboardLines({ rows, selected: 0, message: null, width: 90, height: 11, now: 2_000 })[1]!;
  const unselectedLine = renderDashboardLines({ rows, selected: 1, message: null, width: 90, height: 11, now: 2_000 })[1]!;

  assert.match(selectedLine, /\x1b\[94m❯\x1b\[39m \x1b\[92m DONE\x1b\[39m/);
  assert.match(unselectedLine, / \x1b\[92m DONE\x1b\[39m/);
});

test("dashboard tables show the root path beside the session without the tmux pane path", () => {
  const status: PiDashStatus = { id: "1", paneId: "%1", tmuxSession: "main", tmuxWindow: "api", tmuxWindowIndex: "2", pid: 1, cwd: "/tmp/project", piSessionFile: null, model: null, state: "ASK", severity: "high", summary: "Waiting", lastEventAt: 1_000, heartbeatAt: 1_000 };
  const rows = buildDashboardRows([status], [parseTmuxPanes("main\t2\tapi\t%1\t1\tbash\ttitle\t123\n")[0]!], DEFAULT_CONFIG, 2_000);
  const interactiveTable = renderDashboardLines({ rows, selected: 0, message: null, width: 130, height: 11, now: 2_000 }).join("\n");
  const plainTable = renderRows(rows, 0, 2_000);

  for (const table of [interactiveTable, plainTable]) {
    assert.match(table, /main/);
    assert.match(table, /\/tmp\/project/);
    assert.doesNotMatch(table, /main:2:api\.%1/);
  }
});
