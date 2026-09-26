# TODO

- [ ] build(web): better web infra (all-in-one js files are hard to maintain)
- [ ] build(web): shouldn't re-render the whole table to update its state (maybe we need react or svelte here?)
- [ ] fix(web): should it just notify? think about UX

# Next

- [ ] tests: full review (very weird string assertions, see column width change commit)
- [ ] feat: daemon that will received notification's click and activate the right tmux pane
- [ ] feat: status bar for "narrow" mode
- [ ] fix: "no pi sessions" msg is misleading (since you can dismiss... maybe we should have a "dismissed" panel)
- [ ] (maybe, reflect) feat: mark as read instead of dismiss
- [ ] chore: focused tests (being siblings with the module they are testing)
- [ ] refactor: review sidebar.ts (eg: can call `build*Command` functions directly instead of passing them as params)

# Done

- [x] feat(dashboards): show assistant last message instead of "turn complete" in summary. Also, add a shortcut to open $EDITOR with this message in full.
- [x] fix(web): terminal colors are off (different from a regular terminal)
- [x] feat(web): show qr code
- [x] build: do I need to build/dist? (no, but since pi-muxr binary needs compilation, let's build them all)
- [x] fix: review column widths
