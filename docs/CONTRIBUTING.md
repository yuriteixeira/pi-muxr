# Contributing to `pi-muxr`

## Development workflow

1. Create a branch for your change.
2. Install dependencies with `pnpm install`.
3. Make a focused change.
4. Run `pnpm typecheck`.
5. Run `pnpm test`.
6. Run `pnpm build` when the change affects the build or package output.
7. Update the documentation when behavior or setup changes.

See [BUILDING.md](BUILDING.md) for local setup and Pi extension loading.

## Code changes

- Keep domain logic separate from terminal, web, tmux, and storage code.
- Preserve the SQLite state format unless a schema change is required.
- Keep session summaries short and safe to store.
- Add or update tests for domain behavior.
- Keep keyboard behavior consistent between the terminal and web interfaces where possible.

## Pull requests

Describe:

- What changed.
- Why it changed.
- How you tested it.
- Any tmux, Pi, terminal, or browser behavior that reviewers should check.

Keep unrelated changes out of the same pull request.
