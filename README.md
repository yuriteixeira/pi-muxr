# Welcome to `pi-muxr`

`pi-muxr` is a dashboard for Pi coding sessions that run in tmux.

A Pi extension publishes session state and the dashboard shows which sessions need attention and focuses their respective tmux panes.

## Features

- Tracks multiple Pi sessions across tmux.
- Shows `ASK`, `ERROR`, `DONE`, `RUN`, `IDLE`, and `STALE` states.
- Sorts actionable sessions first.
- Focuses the owning tmux pane from the keyboard.
- Supports read and dismiss actions.
- Detects stale sessions with heartbeats and pane checks.
- Provides terminal and browser interfaces.
- Sends terminal bell, desktop, and browser notifications.
- Supports configurable actionable states and notification behavior.

## Installation

Requirements:

- Node.js 24 or later
- tmux
- Pi

Install the extension and its command with Pi:

```bash
pi install npm:@yuriteixeira/pi-muxr
```

Restart Pi after installation, or run `/reload` in an active session.

To install only the dashboard command globally:

```bash
npm install --global @yuriteixeira/pi-muxr
```

## Usage

```bash
pi-muxr
pi-muxr --sidebar
pi-muxr --sidebar right
pi-muxr --sidebar left
pi-muxr --quit-on-select
pi-muxr --list
pi-muxr --web
```

Run `pi-muxr --sidebar` inside tmux to open and pin a full height dashboard pane on the right side of every window in every tmux session. Pass `left` or `right` to select the side. Each pane uses at most 25 percent of the window width. New tmux sessions and windows receive the same sidebar while it is pinned. Run the command again to close all dashboard sidebar panes and remove the pin.

Use `--quit-on-select` to close the interactive dashboard after Enter focuses the selected row. The browser interface runs at `http://127.0.0.1:3042` by default.

## Development Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Building and local setup](docs/BUILDING.md)
- [Contributing](docs/CONTRIBUTING.md)
