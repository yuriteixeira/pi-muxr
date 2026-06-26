# 02 - Initial Implementation Plan

## Decisions from planning

- Build the MVP as **two cooperating pieces**:
  1. a reusable pi extension package that publishes structured session status;
  2. a `pi-dash` CLI/TUI that reads shared SQLite state, displays rows, and focuses tmux panes.
- Treat these states as actionable by default: `ASK`, `ERROR`, and `DONE`.
- Store shared state in SQLite at `~/.pi-dash/pi-dash.sqlite`.
- Include desktop notifications in the MVP.
- Store dashboard data in plaintext SQLite with data minimization: persist only fields needed for dashboard behavior/display, while allowing rich but bounded summaries for useful dashboard context.
- Develop everything in this repository as a reusable package, with install/link docs for pi.
- TUI MVP scope:
  - sorted dashboard rows;
  - refresh;
  - `Enter` to focus selected pane and mark the current event as read;
  - dismiss/acknowledge selected row;
  - hide dismissed rows by default, with behavior controlled by configuration;
  - dismiss all read rows;
  - emit a terminal bell/beep when a new actionable notification appears while the dashboard is open.

## MVP goal

Create a tmux-native dashboard for active pi sessions that can answer:

1. Which pi sessions exist right now?
2. Which sessions need human attention?
3. What is the most recent meaningful event for each session?
4. Which tmux pane owns the session?
5. How do I jump to that pane immediately?

The MVP should avoid terminal screen scraping. Session state must come from structured records written by the pi extension.

## Proposed repository shape

```text
.
├── package.json
├── tsconfig.json
├── README.md
├── BRAINSTORM.md
├── 02-INITIAL-IMPLEMENTATION.md
└── src
    ├── cli
    │   ├── index.ts
    │   ├── dashboard.ts
    │   └── focus-pane.ts
    ├── extension
    │   └── pi-dash.ts
    ├── notifications
    │   └── desktop.ts
    ├── state
    │   ├── paths.ts
    │   ├── schema.ts
    │   ├── database.ts
    │   ├── read-statuses.ts
    │   └── write-status.ts
    ├── tmux
    │   ├── list-panes.ts
    │   └── focus.ts
    └── domain
        ├── status.ts
        └── sorting.ts
```

This can be adjusted once the actual package/tooling choices are made.

## Status protocol

Shared state lives in SQLite:

```text
~/.pi-dash/pi-dash.sqlite
```

The extension and CLI both write to the same database. This is intentional: SQLite gives us safer concurrent reads/writes than status JSON files, supports partial updates for read/dismiss markers, and gives us a natural place for notification dedupe and dashboard-presence records.

Each pi process owns one row in the `sessions` table. The row ID should be stable for the pi process/session. Prefer a value derived from the pi session file or session ID plus tmux pane ID.

### Status record shape

This TypeScript shape represents a row read from the SQLite `sessions` table.

```ts
type PiDashState =
  | "ASK"
  | "ERROR"
  | "DONE"
  | "QUEUED"
  | "RUN"
  | "IDLE"
  | "STALE";

interface PiDashStatus {
  id: string;
  paneId: string | null;
  tmuxSession: string | null;
  tmuxWindow: string | null;
  tmuxWindowIndex: string | null;
  pid: number;
  cwd: string;
  piSessionFile: string | null;
  model: string | null;
  state: PiDashState;
  severity: "low" | "medium" | "high";
  summary: string;
  lastEventAt: number;
  heartbeatAt: number;
  readUntilEventAt?: number;
  acknowledgedAt?: number;
  dismissedUntilEventAt?: number;
  lastNotifiedEventAt?: number;
  // Keep rich summaries bounded/truncated and avoid storing fields not needed by the dashboard.
}
```

### SQLite schema

Initial schema:

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  pane_id TEXT,
  tmux_session TEXT,
  tmux_window TEXT,
  tmux_window_index TEXT,
  pid INTEGER NOT NULL,
  cwd TEXT NOT NULL,
  pi_session_file TEXT,
  model TEXT,
  state TEXT NOT NULL,
  severity TEXT NOT NULL,
  summary TEXT NOT NULL,
  last_event_at INTEGER NOT NULL,
  heartbeat_at INTEGER NOT NULL,
  read_until_event_at INTEGER,
  acknowledged_at INTEGER,
  dismissed_until_event_at INTEGER,
  last_notified_event_at INTEGER
);

CREATE TABLE IF NOT EXISTS dashboard_presence (
  instance_id TEXT PRIMARY KEY,
  pid INTEGER NOT NULL,
  tmux_pane_id TEXT,
  started_at INTEGER NOT NULL,
  heartbeat_at INTEGER NOT NULL
);
```

`dashboard_presence` is used to suppress desktop notifications while a dashboard instance is open.

### Actionable default

A row is actionable when:

- `state` is one of `ASK`, `ERROR`, `DONE`; and
- it has not been dismissed for the current `lastEventAt`.

A row is unread when:

- it is actionable; and
- `readUntilEventAt` is missing or older than `lastEventAt`.

`DONE` is actionable by default because the intended workflow includes quickly picking up completed long-running tasks. This is an explicit MVP decision even though it may create more notifications than a quieter default.

### Stale handling

The CLI should mark a record as `STALE` at display time when:

- its heartbeat is older than the configured stale threshold; or
- the referenced tmux pane no longer exists.

On clean `session_shutdown`, the extension should remove the session row. The dashboard should still not rely on perfect cleanup and must detect stale rows at display time.

## Pi extension responsibilities

The extension is responsible for publishing semantic pi status.

### Lifecycle event mapping

Initial mapping:

| Pi event / condition | Dashboard state | Summary |
|---|---:|---|
| session starts | `IDLE` | current cwd/model/session |
| agent/turn starts | `RUN` | current task/turn started |
| tool call starts | `RUN` | tool name and compact args summary |
| tool result errors | remember error context | do not immediately override active run unless agent becomes idle |
| agent ends successfully | `DONE` | turn completed |
| agent ends after failure | `ERROR` | last error summary |
| session shutdown | remove row | session ended |

### Heartbeat

The extension should update `heartbeatAt` periodically while pi is alive.

Suggested interval: 5 seconds.

### Explicit human intervention tool

Defer an explicit `request_human_intervention` pi tool from the MVP.

Rationale:

- structured human-intervention requests are useful;
- however, exposing a direct “summon human” primitive may be overused;
- lifecycle/status publishing should ship first.

Keep `ASK` in the protocol so it can be written by future extension-controlled flows or by a later explicit tool.

### Permission state

Do not include `PERMISSION` in the MVP protocol.

Rationale:

- pi’s existing permission flow may not be directly observable through the extension API;
- exposing it in the MVP protocol could imply reliable permission alerts before they exist;
- add a permission state later if the extension can reliably observe or control approval prompts.

## CLI/TUI responsibilities

The `pi-dash` executable should:

1. read session rows from `~/.pi-dash/pi-dash.sqlite`;
2. run `tmux list-panes -a`;
3. join status records to tmux panes by `paneId`;
4. compute display state, including stale/missing panes;
5. sort rows by priority;
6. render a keyboard-driven dashboard;
7. focus the selected pane on `Enter` and mark the current event as read;
8. refresh on `r`;
9. dismiss/acknowledge the selected row on `k` or `d`;
10. dismiss all read actionable rows on `D`;
11. maintain a dashboard-presence heartbeat while open;
12. emit a terminal bell/beep when a new actionable event appears in the dashboard.

### tmux discovery

Use:

```bash
tmux list-panes -a -F '#{session_name}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_active}\t#{pane_current_command}\t#{pane_title}\t#{pane_pid}'
```

Parsed pane fields:

```ts
interface TmuxPane {
  sessionName: string;
  windowIndex: string;
  windowName: string;
  paneId: string;
  paneActive: boolean;
  currentCommand: string;
  paneTitle: string;
  panePid: number;
}
```

### Focus behavior

When invoked inside tmux:

```bash
tmux switch-client -t '<session>:<windowIndex>'
tmux select-pane -t '<paneId>'
```

When invoked outside tmux:

- if possible, print the exact tmux commands needed;
- optionally support a later `--attach` mode.

### Dashboard rows

Initial row format:

```text
STATE   AGE   SESSION/WINDOW.PANE       PROJECT                LAST EVENT
ASK     2m    work:api.%14              ~/repo/api             confirm: run migration?
ERROR   9m    work:web.%22              ~/repo/web             npm test failed
DONE    14m   work:docs.%31             ~/repo/docs            turn completed
RUN     24s   work:core.%18             ~/repo/core            bash: npm test
```

### Sorting priority

Sort by:

1. actionable, unread, and not dismissed;
2. actionable, read, and not dismissed;
3. state priority:
   1. `ASK`
   2. `ERROR`
   3. `DONE`
   4. `QUEUED`
   5. `RUN`
   6. `IDLE`
   7. `STALE`
4. most recent `lastEventAt`;
5. project/session name for stable display.

### Read and dismiss/acknowledge behavior

Read/visited state and dismissed state are separate.

Marking a row as read means the user has visited or inspected the current event. Dismissing a row means the user intentionally wants to suppress the current event from the actionable set.

#### Mark as read

When the user focuses a session with `Enter`:

- set `readUntilEventAt` to the selected row’s current `lastEventAt`;
- then focus the tmux pane;
- keep the row visible in the dashboard;
- render it with lower emphasis than unread actionable rows.

If the extension later writes a newer `lastEventAt`, the row becomes unread again.

#### Dismiss selected row

Dismiss should suppress the current event, not the whole session forever.

Implementation:

- set `dismissedUntilEventAt` to the selected row’s current `lastEventAt`;
- hide dismissed rows by default;
- allow configuration to show dismissed rows, where they should be visible but no longer actionable/prominent;
- if the extension later writes a newer `lastEventAt`, the row becomes actionable and visible again.

#### Dismiss all read rows

Add a bulk action, suggested key `D`, that dismisses every actionable row where:

- `readUntilEventAt >= lastEventAt`; and
- `dismissedUntilEventAt` is missing or older than `lastEventAt`.

This supports the workflow of visiting several sessions first, then clearing all visited/current events in one action.

These updates should be implemented as partial SQLite updates from the CLI, not by rewriting the entire session record.

## Notifications

The MVP has two notification surfaces:

1. desktop notifications emitted by the extension; and
2. terminal bell/beep emitted by the dashboard TUI when new actionable events appear while it is open.

### Desktop notifications

Desktop notifications are part of the MVP, but should be isolated behind a small adapter.

Trigger notifications when a session transitions into one of:

- `ASK`
- `ERROR`
- `DONE`

Avoid notifying repeatedly for the same `lastEventAt` by updating `lastNotifiedEventAt` after a successful or attempted notification.

Suppress desktop notifications globally when there is a fresh dashboard-presence heartbeat from any dashboard instance. This intentionally treats an open dashboard as sufficient to avoid desktop notifications, even if the dashboard is hidden in another tmux window or popup.

Suggested first implementation:

- Linux: `notify-send` when available;
- macOS: `osascript` or `terminal-notifier` when available;
- fallback: no-op with debug logging.

Notification title:

```text
pi-dash: <STATE> in <project>
```

Notification body:

```text
<summary>
<tmux session/window/pane>
```

Keep notification delivery best-effort. It must not break status publishing.

### Dashboard terminal bell

When the TUI is open, it should emit a terminal bell when a new actionable event appears:

```ts
process.stdout.write("\x07");
```

Rules:

- beep only for actionable states: `ASK`, `ERROR`, `DONE`;
- do not beep repeatedly for the same session `lastEventAt`;
- do not beep for events already dismissed;
- keep this independent from desktop notifications.

In tmux, the bell may produce an audible beep or a visual bell depending on user tmux/terminal settings.

## Configuration

Implement configuration file support in the MVP.

Config file:

```text
~/.pi-dash/config.json
```

Suggested defaults:

```json
{
  "stateDir": "~/.pi-dash",
  "databasePath": "~/.pi-dash/pi-dash.sqlite",
  "actionableStates": ["ASK", "ERROR", "DONE"],
  "desktopNotifications": true,
  "suppressDesktopNotificationsWhenDashboardOpen": true,
  "dashboardBell": true,
  "showDismissedRows": false,
  "staleAfterMs": 30000,
  "heartbeatIntervalMs": 5000,
  "dashboardPresenceIntervalMs": 2000,
  "dashboardPresenceStaleAfterMs": 5000
}
```

If the config file is missing, use these defaults from one module.

## tmux popup integration

Document this binding:

```tmux
bind-key P display-popup -E "pi-dash"
```

The CLI should be usable both as a normal terminal command and inside `tmux display-popup`.

## Implementation phases

### Phase 1 - Project skeleton

- Add package metadata and TypeScript tooling.
- Add CLI entrypoint `pi-dash`.
- Add shared domain types for statuses and tmux panes.
- Add state path helpers for `~/.pi-dash` and `~/.pi-dash/pi-dash.sqlite`.
- Add MVP config loading from `~/.pi-dash/config.json` with documented defaults.

Acceptance criteria:

- `pi-dash --help` runs.
- Project builds/typechecks.
- Missing config file falls back to defaults.

### Phase 2 - State protocol

- Implement status schema/types.
- Implement SQLite database initialization/migrations.
- Implement session upserts from the extension.
- Implement reading all session rows.
- Implement read marker update logic.
- Implement dismiss/ack update logic.
- Implement dismiss-all-read update logic.
- Implement dashboard-presence heartbeat writes/cleanup.

Acceptance criteria:

- CLI can read fixture rows from a temp SQLite database.
- CLI can mark a fixture row as read.
- CLI can mark a fixture row dismissed.
- CLI can dismiss all read fixture rows.
- CLI can write and refresh a dashboard-presence heartbeat.

### Phase 3 - tmux integration

- Implement `tmux list-panes -a` parser.
- Join statuses to panes by `%paneId`.
- Implement focus command sequence.

Acceptance criteria:

- CLI lists real tmux panes when run in tmux.
- Selecting a fixture/real row can focus the pane.

### Phase 4 - Minimal TUI

- Render sorted rows.
- Support keyboard navigation.
- Support `r` refresh.
- Support `Enter` focus and mark-as-read.
- Support `d`/`k` dismiss.
- Support `D` dismiss all read rows.
- Support terminal bell/beep for new actionable events while the dashboard is open.

Acceptance criteria:

- Dashboard is usable in a tmux popup.
- Actionable rows appear first.
- Focused rows are marked read until a newer event arrives.
- Dismissed rows lose actionable prominence until a newer event arrives.
- Read actionable rows can be dismissed in bulk.
- New actionable events trigger one dashboard beep per event while the TUI is open.

### Phase 5 - Pi extension publisher

- Create extension source in this repo.
- Register pi lifecycle event handlers.
- Capture `TMUX_PANE`, pid, cwd, model, and session file where available.
- Write heartbeat/status rows.
- Do not add an explicit `request_human_intervention` tool in the MVP.
- Remove the session row on clean pi session shutdown.

Acceptance criteria:

- Running pi with the extension creates/updates a session row in SQLite.
- Starting a turn marks `RUN`.
- Finishing a turn marks `DONE`.
- Clean session shutdown removes the session row.

### Phase 6 - Notifications

- Add desktop notification adapter.
- Trigger desktop notifications on transitions into actionable states.
- Deduplicate desktop notifications per status event with `lastNotifiedEventAt`.
- Suppress desktop notifications when dashboard presence is fresh.
- Add dashboard terminal bell for new actionable events while the TUI is open.

Acceptance criteria:

- `DONE`, `ASK`, and `ERROR` can emit desktop notifications.
- Desktop notifications are suppressed while a dashboard instance has a fresh heartbeat.
- Missing notification commands do not fail the extension.
- Dashboard emits one terminal bell for each newly observed actionable event.

### Phase 7 - Documentation

- Document installation.
- Document pi extension setup.
- Document tmux popup binding.
- Document state directory and cleanup.
- Document known limitations.

Acceptance criteria:

- A new user can install/link the package, enable the extension, run multiple pi sessions, open `pi-dash`, and jump to a pane.

## Testing strategy

Prioritize fast unit tests around pure logic:

- status sorting;
- actionable/read/dismissed calculation;
- stale calculation;
- tmux output parsing;
- path expansion;
- notification deduplication;
- dashboard-presence freshness;
- dashboard bell deduplication.

Add integration-ish tests for:

- reading/writing session rows in a temp SQLite database;
- focus command construction without executing tmux;
- CLI rendering using fixtures where practical.

Manual test matrix:

1. one pi session, one tmux pane;
2. multiple pi panes in one tmux session;
3. multiple tmux sessions;
4. stale session row with missing pane;
5. read `DONE` row followed by a newer `ASK` event;
6. dismissed `DONE` row followed by a newer `ASK` event;
7. dismiss all read rows;
8. dismissed rows are hidden by default and can be shown via configuration;
9. dashboard open suppresses desktop notification;
10. dashboard beeps for a new actionable event;
11. desktop notification command unavailable;
12. CLI launched inside a tmux popup.

## Risks and mitigations

### Pi permission events may not be directly observable

Mitigation: exclude `PERMISSION` from the MVP protocol. Add it later only if permission prompts can be reliably observed or controlled by the extension.

### Session rows can become stale

Mitigation: heartbeat plus display-time stale detection. Treat cleanup as best effort.

### Desktop notifications are platform-specific

Mitigation: isolate behind adapter and keep best-effort/no-op fallback.

### SQLite dependency and concurrency

Mitigation: use SQLite because both the extension and CLI update shared state. Keep writes small and targeted with upserts/partial updates. Use a well-supported Node SQLite package and initialize the database lazily.

### tmux focus can fail if pane disappears

Mitigation: re-check pane existence on refresh/focus and show `STALE` when missing.

## Out of scope for initial MVP

- Socket or HTTP streaming transport.
- Terminal-app-specific OS focus detection.
- Remote/mobile push notifications.
- Non-pi adapters for Claude Code/OpenCode/Aider.
- Full fuzzy search.
- Complex filtering beyond sorted actionable-first display.
- Persistent analytics/history.
- Desktop GUI.

## First concrete task list

1. Create TypeScript package skeleton.
2. Define status/domain types.
3. Implement `~/.pi-dash` path helpers and config loading.
4. Implement SQLite schema/init and session read/upsert with fixtures.
5. Implement tmux pane listing/parser.
6. Implement sorting/actionable/read/dismiss logic.
7. Implement dashboard-presence heartbeat.
8. Build minimal TUI list.
9. Add focus-pane action with mark-as-read.
10. Add dismiss-all-read action.
11. Add dashboard bell for new actionable events.
12. Add pi extension status publisher, including clean shutdown row removal.
13. Add desktop notification adapter with dashboard-presence suppression.
14. Write README install and tmux binding instructions.
