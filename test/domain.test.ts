import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { visibleWidth } from "@earendil-works/pi-tui";
import { DEFAULT_CONFIG } from "../src/config/config.ts";
import { isActionableStatus, isUnreadStatus, type PiMuxrStatus } from "../src/domain/status.ts";
import { openDatabase } from "../src/state/database.ts";
import { applyDatabaseMigrations } from "../src/state/migrations.ts";
import { readStatuses } from "../src/state/read-statuses.ts";
import { dismissAllRead, dismissStatus, markRead, upsertStatus } from "../src/state/write-status.ts";
import { parseTmuxPanes } from "../src/tmux/list-panes.ts";
import { buildPiMuxrCommand, buildSidebarCleanupHookCommand, buildSidebarHookArgs, buildSidebarHookCommand, buildSidebarSplitArgs, buildSidebarUnhookArgs, parseSidebarCleanupWindowTarget, parseSidebarPaneInventory, parseSidebarSide, parseSidebarWindowTarget } from "../src/tmux/sidebar.ts";
import { renderDashboardLines } from "../src/cli/dashboard-component.ts";
import { getStateIcon } from "../src/cli/dashboard-icons.ts";
import { renderRows } from "../src/cli/format.ts";
import { chooseDashboardLayout } from "../src/cli/dashboard-layout.ts";
import { DEFAULT_DASHBOARD_THEME } from "../src/cli/dashboard-theme.ts";
import { buildDashboardRows } from "../src/cli/rows.ts";
import { formatToolName, resolveAgentEndStatus, summarizeAskUserRequest, summarizeAskUserResult, summarizeToolCall } from "../src/extension/pi-muxr.ts";
import { shouldRingTerminalBell } from "../src/notifications/terminal.ts";

test("actionable/read/dismissed calculation", () => {
  const status = { state: "DONE", lastEventAt: 10 } as const;
  assert.equal(isActionableStatus(status), true);
  assert.equal(isUnreadStatus(status), true);
  assert.equal(isUnreadStatus({ state: "RUN", lastEventAt: 10 }), true);
  assert.equal(isUnreadStatus({ ...status, readUntilEventAt: 10 }), false);
  assert.equal(isUnreadStatus({ ...status, dismissedUntilEventAt: 10 }), false);
  assert.equal(isActionableStatus({ ...status, dismissedUntilEventAt: 10 }), false);
});

test("tmux parser", () => {
  const panes = parseTmuxPanes("work\t1\tapi\t%14\t1\tbash\ttitle\t123\n");
  assert.deepEqual(panes[0], { sessionName: "work", windowIndex: "1", windowName: "api", paneId: "%14", paneActive: true, currentCommand: "bash", paneTitle: "title", panePid: 123 });
});

test("sidebar option defaults to right and accepts an explicit side", () => {
  assert.equal(parseSidebarSide([]), null);
  assert.equal(parseSidebarSide(["--sidebar"]), "right");
  assert.equal(parseSidebarSide(["--sidebar", "--list"]), "right");
  assert.equal(parseSidebarSide(["--sidebar", "left"]), "left");
  assert.equal(parseSidebarSide(["--sidebar", "right"]), "right");
  assert.throws(() => parseSidebarSide(["--sidebar", "top"]), /accepts only/);
});

test("sidebar window targets accept tmux window IDs", () => {
  assert.equal(parseSidebarWindowTarget([]), null);
  assert.equal(parseSidebarWindowTarget(["--sidebar-window", "@12"]), "@12");
  assert.equal(parseSidebarCleanupWindowTarget(["--sidebar-cleanup-window", "@12"]), "@12");
  assert.throws(() => parseSidebarWindowTarget(["--sidebar-window"]), /requires a tmux window ID/);
  assert.throws(() => parseSidebarWindowTarget(["--sidebar-window", "work:1"]), /requires a tmux window ID/);
  assert.throws(() => parseSidebarCleanupWindowTarget(["--sidebar-cleanup-window", "work:1"]), /requires a tmux window ID/);
});

test("sidebar pane parser finds marked panes and one non sidebar target per window", () => {
  const output = "%1\t@1\t\n%2\t@1\tleft\n%3\t@2\tright\n%4\t@2\t\n%5\t@3\tother\n";
  assert.deepEqual(parseSidebarPaneInventory(output), {
    sidebarPaneIds: ["%2", "%3"],
    targetPaneIds: ["%1", "%4", "%5"],
  });
  assert.deepEqual(parseSidebarPaneInventory("%2\t@1\tleft\n"), {
    sidebarPaneIds: ["%2"],
    targetPaneIds: [],
  });
});

test("sidebar split places a full height pane with at most 25 percent width", () => {
  const right = buildSidebarSplitArgs("right", "%1", "pi-muxr");
  const left = buildSidebarSplitArgs("left", "%1", "pi-muxr");

  assert.deepEqual(right, ["split-window", "-d", "-f", "-h", "-l", "25%", "-t", "%1", "-P", "-F", "#{pane_id}", "pi-muxr"]);
  assert.deepEqual(left, ["split-window", "-d", "-f", "-h", "-l", "25%", "-b", "-t", "%1", "-P", "-F", "#{pane_id}", "pi-muxr"]);
  assert.equal(buildPiMuxrCommand("/opt/node bin/node", "/tmp/pi-muxr's/index.js"), "'/opt/node bin/node' '/tmp/pi-muxr'\\''s/index.js'");
  const hookCommand = buildSidebarHookCommand("/opt/node bin/node", "/tmp/pi-muxr/index.js");
  const cleanupHookCommand = buildSidebarCleanupHookCommand("/opt/node bin/node", "/tmp/pi-muxr/index.js");
  assert.equal(
    hookCommand,
    "run-shell ''\\''/opt/node bin/node'\\'' '\\''/tmp/pi-muxr/index.js'\\'' --sidebar-window '\\''#{window_id}'\\'''",
  );
  assert.equal(
    cleanupHookCommand,
    "run-shell ''\\''/opt/node bin/node'\\'' '\\''/tmp/pi-muxr/index.js'\\'' --sidebar-cleanup-window '\\''#{window_id}'\\'''",
  );
  assert.deepEqual(buildSidebarHookArgs(hookCommand, cleanupHookCommand), [
    ["set-hook", "-g", "after-new-window[731]", hookCommand],
    ["set-hook", "-g", "after-new-session[731]", hookCommand],
    ["set-hook", "-g", "window-layout-changed[731]", cleanupHookCommand],
  ]);
  assert.deepEqual(buildSidebarUnhookArgs(), [
    ["set-hook", "-g", "-u", "after-new-window[731]"],
    ["set-hook", "-g", "-u", "after-new-session[731]"],
    ["set-hook", "-g", "-u", "window-layout-changed[731]"],
  ]);
});

test("sqlite status markers", () => {
  const db = openDatabase(join(mkdtempSync(join(tmpdir(), "pi-muxr-")), "db.sqlite"));
  const status: PiMuxrStatus = { id: "1", paneId: "%1", tmuxSession: "s", tmuxWindow: "w", tmuxWindowIndex: "0", pid: 1, cwd: "/tmp/project", piSessionFile: null, model: null, state: "DONE", severity: "medium", summary: "done", lastEventAt: 100, heartbeatAt: 100 };
  upsertStatus(db, status);
  markRead(db, "1", 100);
  assert.equal(readStatuses(db)[0]?.readUntilEventAt, 100);
  assert.equal(dismissAllRead(db), 1);
  assert.equal(readStatuses(db)[0]?.dismissedUntilEventAt, 100);
  dismissStatus(db, "1", 100);
  db.close();
});

test("database applies each ordered migration once", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE migration_probe (id TEXT PRIMARY KEY)");
  const migrations = [{ version: 1, apply: (database: DatabaseSync) => database.exec("ALTER TABLE migration_probe ADD COLUMN value TEXT") }];

  applyDatabaseMigrations(db, migrations);
  applyDatabaseMigrations(db, migrations);

  const columns = db.prepare("PRAGMA table_info(migration_probe)").all() as Array<{ name: string }>;
  const version = db.prepare("PRAGMA user_version").get() as { user_version: number };
  assert.ok(columns.some((column) => column.name === "value"));
  assert.equal(version.user_version, 1);
  db.close();
});

test("dismiss all read honors configured actionable states", () => {
  const db = openDatabase(join(mkdtempSync(join(tmpdir(), "pi-muxr-")), "db.sqlite"));
  const status: PiMuxrStatus = { id: "1", paneId: "%1", tmuxSession: "s", tmuxWindow: "w", tmuxWindowIndex: "0", pid: 1, cwd: "/tmp/project", piSessionFile: null, model: null, state: "RUN", severity: "low", summary: "run", lastEventAt: 100, heartbeatAt: 100, readUntilEventAt: 100 };
  upsertStatus(db, status);
  assert.equal(dismissAllRead(db), 0);
  assert.equal(dismissAllRead(db, ["RUN"]), 1);
  assert.equal(readStatuses(db)[0]?.dismissedUntilEventAt, 100);
  db.close();
});

test("dashboard rows only include active sessions and hide dismissed rows", () => {
  const status: PiMuxrStatus = { id: "1", paneId: "%missing", tmuxSession: null, tmuxWindow: null, tmuxWindowIndex: null, pid: 1, cwd: "/tmp/project", piSessionFile: null, model: null, state: "DONE", severity: "medium", summary: "done", lastEventAt: 100, heartbeatAt: 100 };
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

test("terminal bell rings for a new actionable state", () => {
  assert.equal(shouldRingTerminalBell(DEFAULT_CONFIG, "ASK", "RUN"), true);
  assert.equal(shouldRingTerminalBell(DEFAULT_CONFIG, "ASK", "ASK"), false);
  assert.equal(shouldRingTerminalBell(DEFAULT_CONFIG, "RUN", "IDLE"), false);
  assert.equal(shouldRingTerminalBell({ ...DEFAULT_CONFIG, dashboardBell: false }, "DONE", "RUN"), false);
});

test("modern dashboard maps states to status icons", () => {
  assert.equal(getStateIcon("ASK"), "");
  assert.equal(getStateIcon("ERROR"), "");
  assert.equal(getStateIcon("DONE"), "");
  assert.equal(getStateIcon("RUN", 0), "⠋");
  assert.equal(getStateIcon("RUN", 80), "⠙");
  assert.equal(getStateIcon("RUN", 720), "⠏");
  assert.equal(getStateIcon("RUN", 800), "⠋");
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
  const status: PiMuxrStatus = { id: "1", paneId: "%1", tmuxSession: "main", tmuxWindow: "api", tmuxWindowIndex: "2", pid: 1, cwd: "/tmp/project", piSessionFile: null, model: null, state: "ASK", severity: "high", summary: "Need permission to edit a very long config path before continuing", lastEventAt: 1_000, heartbeatAt: 1_000 };
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

test("selected rows preserve the status color and show unread in its own column", () => {
  const status: PiMuxrStatus = { id: "1", paneId: null, tmuxSession: "main", tmuxWindow: null, tmuxWindowIndex: null, pid: 1, cwd: "/tmp/project", piSessionFile: null, model: null, state: "DONE", severity: "medium", summary: "Done", lastEventAt: 1_000, heartbeatAt: 1_000 };
  const rows = buildDashboardRows([status], [], DEFAULT_CONFIG, 2_000);
  const readRows = buildDashboardRows([{ ...status, readUntilEventAt: 1_000 }], [], DEFAULT_CONFIG, 2_000);
  const selectedLine = renderDashboardLines({ rows, selected: 0, message: null, width: 90, height: 11, now: 2_000 })[1]!;
  const unselectedLine = renderDashboardLines({ rows, selected: 1, message: null, width: 90, height: 11, now: 2_000 })[1]!;
  const readLine = renderDashboardLines({ rows: readRows, selected: 1, message: null, width: 90, height: 11, now: 2_000 })[1]!;

  assert.match(selectedLine, /\x1b\[94m❯\x1b\[39m \x1b\[92m DONE\x1b\[39m {5}\x1b\[93m●\x1b\[39m \x1b\[96mmain/);
  assert.match(unselectedLine, /  \x1b\[92m DONE\x1b\[39m {5}\x1b\[93m●\x1b\[39m \x1b\[96mmain/);
  assert.match(readLine, /  \x1b\[92m DONE\x1b\[39m {7}\x1b\[96mmain/);
  assert.doesNotMatch(readLine, /●/);
});

test("dashboard tables show the root path beside the session without the tmux pane path", () => {
  const status: PiMuxrStatus = { id: "1", paneId: "%1", tmuxSession: "main", tmuxWindow: "api", tmuxWindowIndex: "2", pid: 1, cwd: "/tmp/project", piSessionFile: null, model: null, state: "ASK", severity: "high", summary: "Waiting", lastEventAt: 1_000, heartbeatAt: 1_000 };
  const rows = buildDashboardRows([status], [parseTmuxPanes("main\t2\tapi\t%1\t1\tbash\ttitle\t123\n")[0]!], DEFAULT_CONFIG, 2_000);
  const interactiveTable = renderDashboardLines({ rows, selected: 0, message: null, width: 130, height: 11, now: 2_000 }).join("\n");
  const plainTable = renderRows(rows, 0, 2_000);

  for (const table of [interactiveTable, plainTable]) {
    assert.match(table, /main/);
    assert.match(table, /\/tmp\/project/);
    assert.doesNotMatch(table, /main:2:api\.%1/);
  }
});
