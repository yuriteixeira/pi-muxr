# Local CLI link plan

## Goal

Use the repository build for the `pi-muxr` command through pnpm's global link.

## Steps

1. Remove the copy based deployment script and its `package.json` command.
2. Remove the copy based deployment instructions from `docs/BUILDING.md`.
3. Keep the documented local workflow simple:

```bash
pnpm build
pnpm link --global
pnpm start
```

4. Run `pnpm build` and `pnpm link --global`.
5. Confirm that `command -v pi-muxr` selects the pnpm global command.
6. Confirm that the pnpm package link points to this repository.

## Scope

This links the CLI only. Local extension loading remains a separate workflow.
