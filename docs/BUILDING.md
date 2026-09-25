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

## Set up development

Run one command after cloning the repository:

```bash
pnpm dev:setup
```

This command:

1. Installs the project dependencies.
2. Builds the project.
3. Moves the installed package to a temporary backup.
4. Links the installed package path to this repository.

Pi continues to load the package from its normal location, but that location now resolves to the repository. The existing extension and CLI paths therefore use the local build. Pi settings do not change.

Confirm that the local command and version are selected:

```bash
command -v pi-muxr
pi-muxr --version
```

To run the repository CLI without depending on `PATH`, use:

```bash
node "$PWD/dist/cli/index.js"
```

The setup command respects `PI_CODING_AGENT_DIR` when it is set. Otherwise, it uses `~/.pi/agent`.

If Pi is already running, use `/reload` after setup. For later source changes, keep `pnpm start` running and use `/reload` after each extension rebuild.

## Tear down development

Run:

```bash
pnpm dev:teardown
```

This command removes the repository link and moves the installed package backup to its original location.

Use `/reload` in active Pi sessions after teardown.

The extension stores state in:

```text
~/.pi-muxr/pi-muxr.sqlite
```

It removes its row during a clean shutdown. Wrappers around Pi are supported when they load the extension.

See the main [README](../README.md) for user configuration, key bindings, and usage details.
See the main [ARCHITECTURE](../ARCHITECTURE.md) for architectural details.
