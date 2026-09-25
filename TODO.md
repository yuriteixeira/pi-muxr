# TODO

- [ ] feat(web): show qr code
- [ ] tests: full review (very weird string assertions, see column width change commit)
- [ ] **fix(web): terminal colors are off (different from a regular terminal)**
- [ ] fix(web): should it just notify? think about UX

# Next

- [ ] feat: daemon that will received notification's click and activate the right tmux pane
- [ ] feat: status bar for "narrow" mode
- [ ] fix: "no pi sessions" msg is misleading (since you can dismiss... maybe we should have a "dismissed" panel)
- [ ] (maybe, reflect) feat: mark as read instead of dismiss
- [ ] chore: focused tests (being siblings with the module they are testing)
- [ ] refactor: review sidebar.ts (eg: can call `build*Command` functions directly instead of passing them as params)

# Done

- [x] **build: do I need to build/dist?** (no, but since pi-muxr binary needs compilation, let's build them all)
- [x] fix: review column widths
