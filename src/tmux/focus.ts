import { execFileSync } from "node:child_process";
import type { TmuxPane } from "../domain/status.js";

export function focusPane(pane: Pick<TmuxPane, "sessionName" | "windowIndex" | "paneId">): string[] {
  const commands = buildFocusCommands(pane);
  if (!process.env.TMUX) return commands;
  execFileSync("tmux", ["switch-client", "-t", `${pane.sessionName}:${pane.windowIndex}`], { stdio: "ignore" });
  execFileSync("tmux", ["select-pane", "-t", pane.paneId], { stdio: "ignore" });
  return commands;
}

export function buildFocusCommands(pane: Pick<TmuxPane, "sessionName" | "windowIndex" | "paneId">): string[] {
  return [
    `tmux switch-client -t '${escapeSingleQuotes(`${pane.sessionName}:${pane.windowIndex}`)}'`,
    `tmux select-pane -t '${escapeSingleQuotes(pane.paneId)}'`,
  ];
}

function escapeSingleQuotes(value: string): string {
  return value.replaceAll("'", "'\\''");
}
