# pi-dash

`pi-dash` is a tmux-native dashboard for active pi coding-agent sessions. A pi extension writes structured session state to SQLite, and the CLI/TUI reads that state, sorts actionable sessions first, and jumps to the owning tmux pane.

## Install / link for development

```bash
pnpm install
pnpm build
pnpm link --global
```

`pnpm link --global` exposes this local checkout's `pi-dash` binary globally, so you can run `pi-dash` from any directory. It points at `./dist/cli/index.js`, so rebuild after source changes with `pnpm build` or keep `pnpm start` running in another terminal.

The CLI requires Node.js 24+ and uses the built-in `node:sqlite` module. During development, use:

```bash
pnpm typecheck
pnpm test
pnpm start       # build in watch mode
```

Run the CLI with:

```bash
pi-dash --help
pi-dash --list
pi-dash
```

## Enable the pi extension

Build this package, then symlink the built extension directory into pi's global extensions directory:

```bash
pnpm build
mkdir -p ~/.pi/agent/extensions
rm -f ~/.pi/agent/extensions/pi-dash.js ~/.pi/agent/extensions/pi-dash
ln -sfn "$PWD/dist/extension" ~/.pi/agent/extensions/pi-dash
```

The directory symlink is important: the built extension imports sibling modules from `dist`, so symlinking only `dist/extension/pi-dash.js` will break relative imports.

After that, normal `pi` sessions will auto-load `pi-dash`. If pi is already open, run `/reload` in pi after creating or updating the symlink.

The symlink points at the built files in `dist`, so source changes require a rebuild. Use `pnpm build` once, or keep `pnpm start` running while developing.

The extension creates and updates rows in `~/.pi-dash/pi-dash.sqlite` and removes its row on clean shutdown.

## tmux popup binding

```tmux
bind-key P display-popup -E "pi-dash"
```

## Configuration

Optional config file: `~/.pi-dash/config.json`. If it is missing, built-in defaults are used.

An example config is available at [`examples/config.json`](examples/config.json). To start from it:

```bash
mkdir -p ~/.pi-dash
cp examples/config.json ~/.pi-dash/config.json
```

Defaults include actionable states `ASK`, `ERROR`, and `DONE`, desktop notifications enabled, dashboard bell enabled, dismissed rows hidden, 30s stale threshold, and 5s extension heartbeat.

## Keys

- `↑` / `k`: move selection up
- `↓` / `j`: move selection down
- `Enter`: mark selected current event as read and focus its tmux pane
- `d`: dismiss selected current event
- `D`: dismiss all read actionable events
- `r`: refresh
- `q` / `Esc` / `Ctrl+C`: quit

## Known limitations

- The TUI is intentionally minimal.
- Desktop notifications are best-effort (`notify-send` on Linux, `osascript` on macOS).
- Permission prompts are not represented in the MVP protocol.
