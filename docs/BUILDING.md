# Building `pi-muxr`

This guide explains how to build and run a local copy of `pi-muxr`.

## Requirements

- Node.js 24 or later
- pnpm
- tmux for running the dashboard
- Pi for testing the extension

The CLI uses the built in `node:sqlite` module.

## Install and build

```bash
pnpm install
pnpm build
```

The build output is written to `dist`.

For an automatic rebuild during development, run:

```bash
pnpm start
```

## Check the code

```bash
pnpm typecheck
pnpm test
```

## Link the CLI

To run the local CLI from any directory:

```bash
pnpm link --global
```

The command points to `dist/cli/index.js`. Rebuild after source changes, or keep `pnpm start` running.

## Load the Pi extension

Build the package, then link the complete extension directory:

```bash
pnpm build
mkdir -p ~/.pi/agent/extensions
rm -f ~/.pi/agent/extensions/pi-muxr.js ~/.pi/agent/extensions/pi-muxr
ln -sfn "$PWD/dist/extension" ~/.pi/agent/extensions/pi-muxr
```

The directory link is required because the built extension imports sibling modules from `dist`.

If Pi is already running, use `/reload` after creating or changing the link.

The extension stores state in:

```text
~/.pi-muxr/pi-muxr.sqlite
```

It removes its row during a clean shutdown. Wrappers around Pi are supported when they load the extension.

## Run the CLI

```bash
pi-muxr --help
pi-muxr --list
pi-muxr
pi-muxr --web
```

See the main [README](../README.md) for user configuration, key bindings, and usage details.
