# `pi-muxr` architecture

## Purpose

`pi-muxr` gives one view of Pi sessions that run in tmux. It answers three questions:

1. Which sessions are active?
2. Which sessions need attention?
3. Which tmux pane owns each session?

The project does not read terminal output. A Pi extension receives Pi events and publishes structured state. The terminal and browser interfaces read that shared state.

## System overview

```text
Pi session
    |
    | Pi extension events
    +--> terminal bell in the Pi pane
    v
SQLite database: ~/.pi-muxr/pi-muxr.sqlite
    |
    +--> CLI dashboard
    |       |
    |       +--> terminal input and display
    |       +--> tmux pane focus
    |
    +--> Web terminal gateway
    |       |
    |       +--> browser xterm terminal
    |       +--> tmux session through node-pty
    |       +--> browser notifications
    |
    +--> Desktop notifications
```

SQLite is the shared boundary between the Pi extension and the user interfaces. It allows the extension and one or more dashboard processes to read and update state without a separate service. Ordered migrations use SQLite `user_version` to update existing databases inside a transaction.

## Source layout

```text
src/
├── domain/          State types and rules that do not depend on I/O
├── extension/       Pi event integration and session state publishing
├── state/           SQLite schema and state reads and writes
├── tmux/            Pane discovery and pane focus
├── cli/             Terminal entry point and dashboard rendering
├── web/             HTTP server, browser assets, and terminal gateway
├── config/          Configuration and path resolution
└── notifications/   Desktop notification integration
```

The domain layer is kept independent from the terminal, web, tmux, and database layers. This makes state rules easier to test and keeps the user interfaces as clients of the same data model.

## State model

Each Pi process owns one row in the `sessions` table.

Important fields include:

- `id`: Stable identifier for the Pi session and tmux pane.
- `pane_id`: tmux pane identifier such as `%12`.
- `tmux_session`, `tmux_window`, and `tmux_window_index`: Pane location.
- `pid`: Pi process ID.
- `cwd`: Project directory.
- `pi_session_file`: Pi session file when available.
- `model`: Selected model.
- `state`: Current Pi state.
- `severity`: `low`, `medium`, or `high`.
- `summary`: Short description of the latest event.
- `last_prompt`: Latest user prompt, normalized for display.
- `last_event_at`: Time of the latest meaningful event.
- `heartbeat_at`: Time of the latest process heartbeat.
- Read, dismissal, and notification markers.

The database also contains `dashboard_presence`. Dashboard processes update this table so the extension can avoid sending desktop notifications when a dashboard is already open.

## Session states

The domain supports these states:

| State    | Meaning                                                                          |
| -------- | -------------------------------------------------------------------------------- |
| `ASK`    | Pi is waiting for user input through `ask_user`.                                 |
| `ERROR`  | A turn or tool ended with an error.                                              |
| `DONE`   | A turn completed.                                                                |
| `QUEUED` | Work is waiting to start.                                                        |
| `RUN`    | Pi is processing a turn or tool.                                                 |
| `IDLE`   | The session is alive but not active.                                             |
| `STALE`  | Internal display classification for an expired heartbeat or a missing tmux pane. |

By default, `ASK`, `ERROR`, and `DONE` are actionable. The configuration can change the actionable states used by the dashboard, terminal bell, dismissal actions, and browser notifications. Desktop notifications always use the default actionable states.

An event is unread when its `last_event_at` is newer than `read_until_event_at` and it has not been dismissed. Unread and actionable are separate properties. The dashboard can therefore show an unread marker for a state that is not actionable. An event is dismissed when `dismissed_until_event_at` is at least as recent as `last_event_at`. This means a new event becomes visible again after an older event was read or dismissed.

## Pi extension flow

The extension is loaded by Pi and listens to Pi lifecycle events.

```text
session_start
    -> open database
    -> create session ID
    -> publish IDLE state
    -> start heartbeat timer

input
    -> store the submitted user prompt directly in the current session row

agent_start / turn_start
    -> publish RUN state

tool_call
    -> publish ASK for ask_user
    -> publish RUN for other tools

tool_result
    -> retain error information
    -> publish tool summary when needed

agent_end
    -> publish ERROR when the turn failed
    -> otherwise publish DONE

session_shutdown
    -> stop heartbeat
    -> remove session row
    -> close database
```

The extension also refreshes tmux information when it writes a state update. It uses `TMUX_PANE` and tmux pane discovery to associate a Pi process with its owning pane. When the process enters a configured actionable state, the extension emits one terminal bell. Because the bell comes from the Pi process, tmux assigns the alert to the window that owns the Pi pane.

Summaries are truncated before storage. User prompts are normalized to one line and limited to 120 characters, which provides enough text for the dashboard while limiting retained prompt data. This keeps the database small and limits the amount of prompt data retained.

## Heartbeats and stale sessions

The extension updates `heartbeat_at` on a timer. The dashboard does not trust clean shutdown alone because a process can be killed or a pane can disappear.

When dashboard rows are built:

- A session is stale when its heartbeat is older than `staleAfterMs`.
- A session is also stale when its recorded pane is missing.
- Stale rows are classified as `STALE`, marked as not actionable, and removed from the displayed rows.

This check is performed when rows are read. The database does not need a cleanup process for abandoned rows, but abandoned rows remain stored and are hidden from the interfaces.

## CLI dashboard flow

The CLI has four modes:

- Interactive dashboard: `pi-muxr`
- Tmux sidebar toggle: `pi-muxr --sidebar [left|right]`
- Plain output: `pi-muxr --list`
- Browser server: `pi-muxr --web`

The interactive dashboard follows this flow:

```text
load configuration
    -> open SQLite database
    -> record dashboard presence
    -> read session rows
    -> list tmux panes
    -> join sessions with panes
    -> mark and remove stale rows
    -> sort active rows
    -> render dashboard
```

The dashboard refreshes once per second and keeps the selected row. The Pi extension emits terminal bells, so the dashboard does not assign alerts to its own window.

User actions update SQLite before they affect the display:

- `Enter` marks the event as read and focuses its pane.
- `d` dismisses the selected event.
- `D` dismisses all read actionable events.
- `r` refreshes the rows.
- `q`, `Esc`, or `Ctrl+C` cleans up presence and exits.

The rendering layer uses `@earendil-works/pi-tui`. Dashboard orchestration, state updates, tmux commands, and rendering are separate responsibilities.

## Tmux integration

The extension uses `tmux list-panes` to discover pane metadata. The dashboard joins this data with the session rows by pane ID.

When the user focuses a row, `src/tmux/focus.ts` selects the pane and switches to its tmux session and window. When the CLI runs outside tmux, it reports the commands needed to focus the pane instead of pretending that the focus succeeded.

The sidebar command splits every window in every tmux session and starts the same `pi-muxr` entrypoint in each new pane. The default side is right, and each pane uses at most 25 percent of the window width. A tmux pane option marks each pane. A global tmux option stores the selected side. Indexed `after-new-session` and `after-new-window` hooks add the sidebar to new sessions and windows without replacing other hooks. An indexed `window-layout-changed` hook closes a sidebar when it is the only pane left in its window. The next sidebar command finds the markers, closes all dashboard sidebar panes, and removes the option and hooks.

The browser gateway uses a separate tmux session, named `pi-muxr-web` by default. A query parameter can select another valid session name.

## Browser interface

The web interface is a local HTTP server with a WebSocket terminal gateway.

```text
Browser
  | HTTP
  v
Web server
  | serves page, assets, and terminal theme
  |
  | WebSocket
  v
Terminal gateway
  | node-pty
  v
 tmux attach-session
```

When a browser connects, the gateway:

1. Validates the requested tmux session name.
2. Creates the session when it does not exist.
3. Temporarily hides the tmux status line.
4. Starts `tmux attach-session` through `node-pty`.
5. Forwards terminal output to the browser.
6. Forwards keyboard input and valid resize messages to the terminal.
7. Polls SQLite for unread actionable events and sends browser notification messages.
8. Restores tmux status and closes resources when the connection ends.

The web interface is a terminal view, not a second dashboard implementation. It attaches to the tmux session that runs the normal CLI dashboard.

## Notifications

The terminal bell and browser notifications use the configured actionable states. Desktop notifications use the fixed default states: `ASK`, `ERROR`, and `DONE`.

Desktop notification flow:

```text
extension state update
    -> check default desktop notification state
    -> check previous notification marker
    -> check dashboard presence
    -> send desktop notification
    -> store last_notified_event_at
```

The extension avoids repeated desktop notifications for the same state. When configured, a fresh dashboard presence suppresses desktop notifications because the user can already see the event.

The Pi extension emits the terminal bell when a session enters a new actionable state. It compares the new state with the stored state to avoid a repeated bell. The browser gateway polls notification state and sends browser messages for new unread actionable rows.

## Configuration boundary

Configuration is loaded from `~/.pi-muxr/config.json`. If the file does not exist, built in defaults are used.

Configuration controls:

- Database and state paths.
- Actionable states for the dashboard, terminal bell, dismissal actions, and browser notifications.
- Desktop notification behavior for the fixed `ASK`, `ERROR`, and `DONE` states.
- Terminal bell behavior.
- Whether dismissed rows are shown.
- Stale and heartbeat timing.
- Dashboard presence timing.

The CLI, extension, and web gateway all load the same configuration. They share state and timing rules, while desktop notifications retain their fixed default state list.

## Design decisions

### Structured events instead of screen scraping

Pi events provide clear meaning and stable summaries. Screen scraping would depend on terminal formatting and would not reliably identify questions, errors, or completed turns.

### SQLite instead of per process files

SQLite supports concurrent reads and writes, preserves read and dismissal markers, and keeps the state model in one place.

### tmux as the focus layer

Pi sessions already run in tmux. Storing the pane ID allows the dashboard to move from an event directly to the owning session without controlling Pi itself.

### Shared domain rules

Actionable, unread, dismissed, and stale behavior is defined in the domain and used by every interface. This prevents the terminal and browser paths from making different decisions about the same event.

### Best effort cleanup with display time checks

Clean shutdown removes rows, but stale detection remains necessary for crashes, closed panes, and killed processes.

## Extension points

The design leaves room for future changes without changing the main data flow:

- Add new Pi event mappings in the extension.
- Add new states to the domain model and configuration.
- Add another client that reads the SQLite state.
- Add notification providers beside desktop and browser notifications.
- Add more tmux actions without changing session publishing.

A new interface should read the domain state and reuse the existing row rules. It should not create a second session protocol.
