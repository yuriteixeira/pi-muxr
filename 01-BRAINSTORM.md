# Brainstorm: Pi Notifications Dashboard for tmux

## Goal

Build a lightweight dashboard that shows all running `pi` sessions across multiple tmux sessions and highlights the panes that need human intervention, with one-key focus into the right tmux pane.

Primary user story:

> I run multiple pi sessions in multiple tmux sessions. I want one place to see which session is blocked, asking a question, waiting for permission, errored, or done, and jump directly to that pane.

## Research summary

### What tmux already provides

Relevant tmux primitives:

- Panes have stable IDs like `%12`; the child process gets this in `$TMUX_PANE`.
- `tmux list-panes -a -F ...` can enumerate sessions, windows, panes, titles, active state, current command, and activity flags.
- `tmux switch-client -t <session>:<window>` and `tmux select-pane -t %pane_id` can focus a pane.
- `tmux monitor-activity`, `monitor-bell`, and alert styles can mark windows with activity/bells.
- `tmux display-popup` can show a dashboard without leaving the current layout.
- Built-in keys `M-n` / `M-p` jump to next/previous window with bell/activity markers.

Limitations:

- tmux activity/bell is low signal. It says “something happened,” not “this pi session needs you.”
- It is window-centric in common UI, while our target is pane-level routing.
- It cannot understand pi state unless pi emits structured state.

### Pi extension surface

Pi is a good fit because extensions can subscribe to lifecycle events and expose UI/status:

- Events: `session_start`, `agent_start`, `turn_start`, `tool_call`, `tool_result`, `agent_end`, `message_end`, `session_shutdown`, etc.
- UI: `ctx.ui.notify`, `ctx.ui.setStatus`, `ctx.ui.setWidget`, custom commands, shortcuts, and custom TUI.
- Session access: `ctx.sessionManager`, current cwd/model/session file, idle/pending helpers.
- Pi explicitly recommends tmux for background bash / multi-session observability.

Implication: the cleanest solution is not screen-scraping. It is a pi extension that publishes structured status, plus a tmux-aware dashboard that reads it and focuses panes.

### Competition / adjacent tools

| Tool / area | Relevant feature | Gap we can exploit |
|---|---|---|
| tmux built-ins | Activity, bell, silence alerts, status styling, pane/window navigation | No semantic knowledge of “needs human,” no cross-session pi metadata, not agent-aware |
| Claude Code | Hooks for lifecycle events, `Notification` hook, permission hooks, mobile/remote-control push notifications, settings for proactive push notifications | Strong event system, but not tmux-pane-first; push notifications help you know something happened, not necessarily jump to exact pane |
| OpenCode | TUI `attention` settings for questions, permissions, errors, completed sessions; desktop notifications/sounds when terminal is blurred | Good attention model, but not specifically a multi-pane tmux dashboard/focus router |
| Aider | `--notifications` and `--notifications-command` | Simple completion/attention notification, but not structured multi-session dashboard |
| OpenAI Codex CLI | Has TUI/desktop app direction, approvals/permissions, hooks/features in codebase | Less obviously centered on tmux; desktop/web app can replace terminal focus rather than integrate with it |
| Generic desktop notification tools (`terminal-notifier`, `notify-send`, OSC 9) | Can alert outside terminal | Alerts are useful, but they do not solve “which pane and focus it now?” |

Positioning opportunity:

> “tmux-native agent control tower”: pane-aware, semantic, keyboard-driven, and extensible through pi rather than a separate desktop app.

## Product ideas

### 1. Minimal viable dashboard

A command such as:

```bash
pi-dash
```

or a tmux popup binding:

```tmux
bind-key P display-popup -E "pi-dash"
```

Dashboard rows:

```text
STATE   AGE   SESSION/WINDOW.PANE       PROJECT                LAST EVENT
ASK     2m    work:api.%14              ~/repo/api             confirm: run migration?
ERROR   9m    work:web.%22              ~/repo/web             npm test failed
DONE    14m   work:docs.%31             ~/repo/docs            waiting for next prompt
RUN     24s   work:core.%18             ~/repo/core            bash: npm test
```

Keys:

- `Enter`: focus selected pane.
- `r`: refresh.
- `/`: fuzzy filter by project/session/state/text.
- `a`: show only actionable states.
- `b`: bell/notify selected pane again.
- `k`: dismiss/acknowledge notification.

### 2. State model

Suggested states, highest priority first:

1. `ASK` - pi or extension is explicitly waiting for user input/confirmation/select.
2. `PERMISSION` - a tool/action requires approval.
3. `ERROR` - last turn/tool failed and pi is idle.
4. `DONE` - agent finished a turn and is idle.
5. `QUEUED` - has pending steering/follow-up messages.
6. `RUN` - actively streaming/thinking/executing tools.
7. `IDLE` - no current actionable event.
8. `STALE` - pane/process disappeared or heartbeat expired.

Important distinction: `DONE` may or may not be actionable. We can make it configurable:

- Conservative: only notify on explicit `ASK`, `PERMISSION`, `ERROR`.
- Busy-work mode: also notify on `DONE`, so long-running tasks are easy to pick back up.

### 3. Reliable event source

Prefer a pi extension that writes JSON status records to a state directory, keyed by pane/session:

```json
{
  "id": "pi:session-id-or-file:%14",
  "paneId": "%14",
  "tmuxSession": "work",
  "tmuxWindow": "api",
  "pid": 12345,
  "cwd": "/home/me/repo",
  "piSessionFile": "/home/me/.pi/agent/sessions/...jsonl",
  "state": "ASK",
  "severity": "high",
  "summary": "Approve bash command? npm run migrate",
  "lastEventAt": 1760000000000,
  "heartbeatAt": 1760000005000
}
```

Transport options:

- **MVP:** write one JSON file per pi process under `$XDG_RUNTIME_DIR/pi-dash/` or `~/.pi/agent/dashboard/`.
- **Better:** Unix domain socket / local HTTP server for streaming updates.
- **Optional:** emit OSC 9 / terminal bell / desktop notification only for high-priority state transitions.

### 4. tmux pane discovery and focus

Discovery command:

```bash
tmux list-panes -a -F '#{session_name}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_active}\t#{pane_current_command}\t#{pane_title}\t#{pane_pid}'
```

Focus sequence:

```bash
tmux switch-client -t "${session}:${window_index}"
tmux select-pane -t "${pane_id}"
```

If invoked outside tmux, use `tmux attach -t <session>` or print the target command.

### 5. Pi integration strategy

#### MVP extension

A global extension in `~/.pi/agent/extensions/pi-dash.ts`:

- On `session_start`: register pane ID from `process.env.TMUX_PANE`, cwd, session file, model.
- On `agent_start` / `turn_start`: state `RUN`.
- On `tool_call`: include current tool summary.
- On `tool_result` error: record potential `ERROR` context.
- On `agent_end`: state `DONE` or `ERROR` depending on last turn.
- On `session_shutdown`: remove or mark `STALE`.
- Heartbeat timer during session.

#### Explicit “needs human” path

For high precision, add a tool such as `request_human_intervention`:

- The model calls it when blocked by missing information, ambiguous product choices, credentials, destructive actions, etc.
- The extension marks state `ASK` with the request summary.
- The dashboard surfaces it at the top.

This avoids unreliable natural-language detection of “I need your input.”

#### Permission/confirmation path

Pi does not bake in permission popups, but extensions can implement confirmation gates using `ctx.ui.confirm/select/input`. A dashboard-aware confirmation extension can mark `PERMISSION` before showing the prompt and clear it after response.

## Notification surfaces

Layered approach:

1. **tmux status/bell** for terminal-native awareness.
2. **Dashboard popup** for triage and focus.
3. **Desktop notification** for when terminal is hidden/blurry.
4. **Optional sound** for high-priority states.
5. **Optional remote push** later, but not MVP.

Config example:

```json
{
  "notifyOn": ["ASK", "PERMISSION", "ERROR"],
  "includeDone": false,
  "desktopNotifications": true,
  "tmuxBell": true,
  "staleAfterMs": 30000
}
```

## Open questions / decisions

1. Should `DONE` be considered human intervention by default, or only explicit `ASK/PERMISSION/ERROR`?
2. Should the dashboard be a standalone CLI, a pi extension UI command, a tmux popup, or all three?
3. Should state live in `~/.pi/agent/` for pi affinity or `$XDG_RUNTIME_DIR` for ephemeral process state?
4. Do we want desktop notifications in MVP, or keep MVP terminal/tmux-only?
5. Should we support non-pi panes later via adapters for Claude Code/OpenCode/Aider?

## Recommended MVP

Build in two pieces:

1. **`pi-dash` pi extension** that publishes per-session JSON status and exposes a `request_human_intervention` tool.
2. **`pi-dash` CLI/TUI** that reads statuses, joins them with `tmux list-panes`, sorts actionable sessions first, and focuses panes with `tmux switch-client` + `select-pane`.

Why this shape:

- Avoids screen scraping.
- Works with multiple pi sessions and projects.
- Keeps tmux as the process supervisor.
- Uses pi’s extension model for semantic state.
- Leaves room for desktop notifications, sockets, and non-pi adapters later.

## Differentiators

- Pane-first: every alert maps to a tmux pane and can be focused immediately.
- Semantic: states come from pi lifecycle/tool/user-interaction events, not raw terminal output.
- Low-friction: no separate desktop app required.
- Extensible: other tools can publish the same JSON protocol later.
- Hackable: tmux users can bind it into status line, popups, or custom scripts.

## Sources consulted

- Pi README and extension docs: extension events, UI APIs, session management, tmux philosophy.
- Pi tmux docs: extended-key recommendations and tmux compatibility notes.
- tmux manual: pane IDs, list/focus commands, monitor-activity/bell, popup/status features.
- Claude Code docs: hooks, notifications, permission events, remote-control/push notification settings.
- OpenCode docs: TUI attention notifications/sounds for questions, permissions, errors, done events.
- Aider docs: `--notifications` and `--notifications-command`.
- OpenAI Codex repository/docs: TUI/desktop direction, approval/hooks-related features in codebase.
