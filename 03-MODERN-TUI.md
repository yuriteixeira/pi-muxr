# 03 - Modern TUI Plan

## Decision

Create a separate modernization plan instead of rewriting `02-INITIAL-IMPLEMENTATION.md`.

`02-INITIAL-IMPLEMENTATION.md` remains the MVP implementation record. This document describes the next iteration: making the dashboard feel like a polished modern terminal app while preserving the existing session/state protocol.

## Goals

- Replace the current plain fixed-width table with a modern dashboard layout.
- Use color intentionally, preferably through a Base16-inspired palette.
- Assume UTF-8, box drawing characters, and Nerd Font glyphs are available.
- Preserve the core workflow:
  - quickly identify sessions needing attention;
  - move selection with the keyboard;
  - focus/read with `Enter`;
  - dismiss selected or read rows;
  - refresh automatically and manually;
  - keep bell behavior for new actionable unread events.
- Keep the CLI usable inside a tmux popup.
- Avoid changing the SQLite schema or pi extension protocol unless the visual design exposes a clear need.

## Non-goals

- Redesigning the extension status protocol.
- Adding a mouse UI.
- Adding configuration screens in the first modern-TUI pass.
- Supporting terminals without ANSI color, UTF-8, or Nerd Font glyphs.
- Making desktop notifications richer; this plan is about the dashboard TUI.

## Current state

The dashboard is currently rendered by hand:

- `src/cli/dashboard.ts` owns raw-mode setup, timers, key handling, full-screen clearing, and lifecycle cleanup.
- `src/cli/format.ts` renders a minimal fixed-width text table.
- `@earendil-works/pi-tui` is not currently a dependency.
- The current rendering does a full clear (`\x1b[2J\x1b[H`) every refresh, which is simple but visually basic and more prone to flicker.

## Recommendation: use `@earendil-works/pi-tui`

Use `@earendil-works/pi-tui` for the modern implementation unless a spike reveals a blocker.

Reasons:

- It provides `TUI` and `ProcessTerminal` for standalone CLI apps.
- It supports differential rendering and synchronized output, which should reduce flicker compared with manual full-screen clears.
- It includes robust keyboard helpers (`matchesKey`, `Key`) instead of comparing raw escape strings directly.
- It provides terminal width utilities (`visibleWidth`, `truncateToWidth`, `wrapTextWithAnsi`) that matter once we add ANSI colors and glyphs.
- It already powers pi TUI components, so the dependency aligns with the broader ecosystem.

Caveat: `pi-tui` gives primitives, not an out-of-the-box dashboard. We should still implement a custom dashboard component for the table/card layout.

## Visual direction

### Overall layout

Use a full-screen dashboard with these regions:

```text
╭─  pi-dash ──────────────────────────────── 3 sessions • 2 need attention ─╮
│                                                                            │
│  filter/stat strip                                                         │
│                                                                            │
│  session rows or cards                                                     │
│                                                                            │
├────────────────────────────────────────────────────────────────────────────┤
│ ↑/↓ select  ↵ focus/read d dismiss  D dismiss read  r refresh  q quit      │
╰────────────────────────────────────────────────────────────────────────────╯
```

The exact layout should adapt to terminal width:

- Wide terminals: rich table with columns.
- Medium terminals: compact table with truncated project and summary.
- Narrow terminals: stacked cards, one row may occupy multiple lines.

### Row design

Each session row should show:

- selection indicator: `▸`, `❯`, or an accented left bar;
- unread indicator: `●` or `◆`;
- state icon and label;
- age;
- tmux target;
- project path;
- summary.

Example wide row:

```text
┃ ●  ASK     12s   main:2:api.%14      ~/work/api          Need permission to edit config
│    DONE     3m   main:1:web.%9       ~/work/web          Tests passed
│    ERROR   18m   main:4:jobs.%21     ~/work/jobs         Tool failed: pnpm test
```

Example compact card:

```text
╭─ ●  ASK  12s ─ main:2:api.%14 ──────────────────────────────╮
│ ~/work/api                                                   │
│ Need permission to edit config                               │
╰──────────────────────────────────────────────────────────────╯
```

### State icons

Initial icon mapping:

| State | Icon | Intent |
|---|---:|---|
| `ASK` | `` | user input needed |
| `ERROR` | `` | failure needs inspection |
| `DONE` | `` | completed and ready to review |
| `RUN` | `` | currently active |
| `QUEUED` | `󰔟` | pending work |
| `IDLE` | `󰒲` | alive but not active |
| `STALE` | `󰅖` | dead/missing/expired |

Keep labels visible alongside icons so the dashboard remains understandable even if a glyph renders unexpectedly.

### Base16-inspired palette

Define semantic colors first, then map them to Base16 slots.

| Semantic role | Base16 slot | Typical use |
|---|---:|---|
| background | `base00` | app background if needed |
| surface | `base01` | header/footer/cards |
| selected surface | `base02` | selected row background |
| border muted | `base03` | inactive borders/dividers |
| muted text | `base04` | help text, dim metadata |
| text | `base05` | primary text |
| bright text | `base06` | titles/high priority |
| accent | `base0D` | selected row, focus affordance |
| success | `base0B` | `DONE` |
| warning | `base0A` | `ASK`, unread attention |
| error | `base08` | `ERROR` |
| info | `base0C` | `RUN`, activity |
| purple | `base0E` | optional highlights |

Implementation should not hard-code one theme everywhere. Start with one built-in palette and keep the rendering functions parameterized by a `DashboardTheme` object.

## Proposed implementation shape

Add a focused TUI layer while keeping domain/state code unchanged:

```text
src/cli
├── dashboard.ts              # orchestration: db, timers, presence, focus actions
├── dashboard-component.ts    # pi-tui Component implementation
├── dashboard-theme.ts        # Base16 palette + semantic styling helpers
├── dashboard-layout.ts       # width-aware layout helpers
├── dashboard-icons.ts        # state/glyph mapping
└── format.ts                 # either removed later or kept for --list/plain output
```

Suggested dependency:

```json
"dependencies": {
  "@earendil-works/pi-tui": "^0.80.2"
}
```

The dashboard component should receive callbacks rather than own infrastructure:

```ts
interface DashboardActions {
  refresh(): void;
  focusSelected(): void;
  dismissSelected(): void;
  dismissAllRead(): void;
  quit(): void;
}
```

This keeps database writes, tmux commands, and process lifecycle in `dashboard.ts`, while rendering and key interpretation live in the component.

## Interaction model

Required keys:

- `↑` / `k`: move selection up
- `↓` / `j`: move selection down
- `Enter`: mark selected current event as read and focus its tmux pane
- `d`: dismiss selected current event
- `D`: dismiss all read actionable events
- `r`: refresh
- `q` / `Esc` / `Ctrl+C`: quit

Nice-to-have keys after the first pass:

- `g`: first row
- `G`: last row
- `?`: help overlay
- `/`: filter/search overlay
- `a`: toggle actionable-only / all rows

Use `matchesKey()` and `Key` from `@earendil-works/pi-tui` instead of raw escape sequence comparisons.

## Rendering rules

- Every rendered line must fit the provided width.
- Use `truncateToWidth()` for ANSI-safe truncation.
- Use `visibleWidth()` when manually padding strings containing ANSI or wide glyphs.
- Reapply ANSI styling per line; do not rely on styles carrying across lines.
- Cache rendered rows only if needed; call `invalidate()` when rows, selection, theme, or dimensions change.
- Prefer stable layout over maximum information density.

## Migration phases

### Phase 1: dependency spike

- Add `@earendil-works/pi-tui`.
- Build a tiny standalone dashboard component with fake rows.
- Verify startup/shutdown behavior in:
  - normal terminal;
  - tmux pane;
  - tmux popup.
- Verify resize handling and `Ctrl+C` cleanup.

Exit criteria: a proof-of-concept renders and exits cleanly without leaking raw terminal mode.

### Phase 2: component replacement

- Replace manual full-screen rendering in `src/cli/dashboard.ts` with `TUI` + `ProcessTerminal`.
- Move key handling into `DashboardComponent`.
- Preserve all existing actions and timers.
- Keep `renderRows()` available for `--list` or tests if useful.

Exit criteria: feature parity with current TUI.

### Phase 3: modern visual treatment

- Add semantic theme helpers.
- Add header, footer, borders, glyphs, and state colors.
- Implement responsive wide/medium/narrow row layouts.
- Improve empty state and stale-state messaging.

Exit criteria: dashboard looks modern and remains readable at common tmux popup sizes.

### Phase 4: polish

- Add help overlay (`?`).
- Add optional filtering/search if the dashboard becomes dense.
- Add config hooks for theme name and glyph mode if needed.
- Consider a screenshot/demo section in `README.md`.

## Testing plan

- Keep existing domain tests unchanged.
- Add pure tests for:
  - state icon mapping;
  - theme role mapping;
  - layout mode selection by width;
  - row truncation invariants.
- Add a fake terminal harness if practical for component rendering tests.
- Manual smoke tests:
  - `pi-dash --list` still works;
  - `pi-dash` starts and exits cleanly;
  - resize terminal during refresh;
  - focus selected tmux pane;
  - dismiss selected row;
  - dismiss all read rows;
  - new unread actionable event triggers a bell only once.

## Acceptance criteria

- The dashboard no longer looks like a plain text dump.
- The selected row is visually obvious.
- Actionable unread rows stand out immediately.
- Stale sessions are visually distinct but not more alarming than active errors.
- The UI does not flicker noticeably during refresh.
- All current keyboard workflows still work.
- Terminal state is restored after `q`, `Esc`, or `Ctrl+C`.
- The implementation remains mostly isolated to the CLI/TUI layer.

## Open questions

- Should the default view show all sessions, or only actionable sessions with a toggle for all?
- Should theme selection be configurable in `~/.pi-dash/config.json` immediately, or deferred until after one polished default theme exists?
- Should there be a plain ASCII/no-glyph fallback despite the current assumption that Nerd Font and UTF-8 are available?
