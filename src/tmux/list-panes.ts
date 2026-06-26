import { execFileSync } from "node:child_process";
import type { TmuxPane } from "../domain/status.js";

export const TMUX_PANES_FORMAT = "#{session_name}\t#{window_index}\t#{window_name}\t#{pane_id}\t#{pane_active}\t#{pane_current_command}\t#{pane_title}\t#{pane_pid}";

export function parseTmuxPanes(output: string): TmuxPane[] {
  return output.split(/\r?\n/).filter(Boolean).map(parseTmuxPaneLine).filter((pane): pane is TmuxPane => pane !== null);
}

export function parseTmuxPaneLine(line: string): TmuxPane | null {
  const [sessionName, windowIndex, windowName, paneId, paneActive, currentCommand, paneTitle, panePid] = line.split("\t");
  if (!sessionName || !windowIndex || !paneId) return null;
  return { sessionName, windowIndex, windowName: windowName ?? "", paneId, paneActive: paneActive === "1", currentCommand: currentCommand ?? "", paneTitle: paneTitle ?? "", panePid: Number(panePid ?? 0) };
}

export function listTmuxPanes(): TmuxPane[] {
  try {
    const output = execFileSync("tmux", ["list-panes", "-a", "-F", TMUX_PANES_FORMAT], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return parseTmuxPanes(output);
  } catch {
    return [];
  }
}
