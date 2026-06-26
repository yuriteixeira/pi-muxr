import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SESSION_NAME_PATTERN = /^[A-Za-z0-9_.:-]+$/;

export function isValidSessionName(name: string): boolean {
  return SESSION_NAME_PATTERN.test(name);
}

export async function ensurePiDashSession(session: string): Promise<void> {
  if (!isValidSessionName(session)) throw new Error("Invalid tmux session name.");
  if (await hasSession(session)) return;
  await execFileAsync("tmux", ["new-session", "-d", "-s", session, piDashCommand()]);
}

export async function hideTmuxStatus(session: string): Promise<string> {
  const { stdout } = await execFileAsync("tmux", ["show-options", "-t", session, "-v", "status"]);
  const previousStatus = stdout.trim() || "on";
  await execFileAsync("tmux", ["set-option", "-t", session, "status", "off"]);
  return previousStatus;
}

export function restoreTmuxStatus(session: string, previousStatus: string): void {
  execFile("tmux", ["set-option", "-t", session, "status", previousStatus], () => {});
}

async function hasSession(session: string): Promise<boolean> {
  try {
    await execFileAsync("tmux", ["has-session", "-t", session]);
    return true;
  } catch {
    return false;
  }
}

function piDashCommand(): string {
  const entrypoint = JSON.stringify(process.argv[1] ?? "pi-dash");
  return `${JSON.stringify(process.execPath)} ${entrypoint}`;
}
