import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_CONFIG } from "../src/config/config.ts";
import { isActionableStatus, isUnreadStatus, type PiDashStatus } from "../src/domain/status.ts";
import { openDatabase } from "../src/state/database.ts";
import { readStatuses } from "../src/state/read-statuses.ts";
import { dismissAllRead, dismissStatus, markRead, upsertStatus } from "../src/state/write-status.ts";
import { parseTmuxPanes } from "../src/tmux/list-panes.ts";
import { buildDashboardRows } from "../src/cli/rows.ts";

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

test("dashboard rows mark stale and hide dismissed", () => {
  const status: PiDashStatus = { id: "1", paneId: "%missing", tmuxSession: null, tmuxWindow: null, tmuxWindowIndex: null, pid: 1, cwd: "/tmp/project", piSessionFile: null, model: null, state: "DONE", severity: "medium", summary: "done", lastEventAt: 100, heartbeatAt: 100 };
  const rows = buildDashboardRows([status], [], { ...DEFAULT_CONFIG, showDismissedRows: false }, 100_000);
  assert.equal(rows[0]?.displayState, "STALE");
});
