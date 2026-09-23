import { execFileSync } from "node:child_process";
import type { PiMuxrStatus } from "../domain/status.js";
import { projectName } from "../domain/status.js";

export function notifyStatus(status: PiMuxrStatus): void {
  const title = `pi-muxr: ${status.state} in ${projectName(status.cwd)}`;
  const body = `${status.summary}\n${formatLocation(status)}`;
  tryNotify(title, body);
}

function tryNotify(title: string, body: string): void {
  if (process.platform === "darwin") {
    try {
      execFileSync(
        "osascript",
        ["-e", `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title)}`],
        { stdio: "ignore" },
      );
    } catch {}
    return;
  }
  if (process.platform === "linux") {
    try {
      execFileSync("notify-send", [title, body], { stdio: "ignore" });
    } catch {}
  }
}

function formatLocation(status: PiMuxrStatus): string {
  const session = status.tmuxSession ?? "?";
  const windowIndex = status.tmuxWindowIndex ?? "?";
  const pane = status.paneId ?? "?";
  return `${session}:${windowIndex}.${pane}`;
}
