import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SESSION_NAME_PATTERN = /^[A-Za-z0-9_.:-]+$/;
const PANE_ID_PATTERN = /^%[0-9]+$/;
const hiddenStatusSessions = new Map<string, { clients: number; previousStatus: string }>();

export function isValidSessionName(name: string): boolean {
  return SESSION_NAME_PATTERN.test(name);
}

export function isValidPaneId(paneId: string): boolean {
  return PANE_ID_PATTERN.test(paneId);
}

export function buildAttachSessionArgs(session: string, paneId: string | null): string[] {
  const args = ["attach-session", "-t", session];
  if (paneId) args.push(";", "select-window", "-t", paneId, ";", "select-pane", "-t", paneId);
  return args;
}

export async function ensurePiMuxrSession(session: string): Promise<void> {
  if (!isValidSessionName(session)) throw new Error("Invalid tmux session name.");
  if (await hasSession(session)) return;
  await execFileAsync("tmux", ["new-session", "-d", "-s", session, piMuxrCommand()]);
}

export async function hideTmuxStatus(session: string): Promise<void> {
  const existing = hiddenStatusSessions.get(session);
  if (existing) {
    existing.clients += 1;
    return;
  }

  const { stdout } = await execFileAsync("tmux", ["show-options", "-t", session, "-v", "status"]);
  const previousStatus = stdout.trim() || "on";
  await execFileAsync("tmux", ["set-option", "-t", session, "status", "off"]);
  hiddenStatusSessions.set(session, { clients: 1, previousStatus });
}

export function restoreTmuxStatus(session: string): void {
  const existing = hiddenStatusSessions.get(session);
  if (!existing) return;

  existing.clients -= 1;
  if (existing.clients > 0) return;

  hiddenStatusSessions.delete(session);
  execFile("tmux", ["set-option", "-t", session, "status", existing.previousStatus], () => {});
}

async function hasSession(session: string): Promise<boolean> {
  try {
    await execFileAsync("tmux", ["has-session", "-t", session]);
    return true;
  } catch {
    return false;
  }
}

function piMuxrCommand(): string {
  const entrypoint = JSON.stringify(process.argv[1] ?? "pi-muxr");
  return `${JSON.stringify(process.execPath)} ${entrypoint}`;
}
