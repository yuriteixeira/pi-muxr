import { relative } from "node:path";
import type { DashboardRow } from "../domain/status.js";

export function renderRows(rows: DashboardRow[], selected = 0, now = Date.now()): string {
  const lines = ["STATE   AGE   SESSION          LAST PROMPT                    LAST EVENT               ROOT PATH"];
  rows.forEach((row, index) => lines.push(formatRow(row, index === selected, now)));
  if (rows.length === 0) lines.push("No pi sessions found.");
  return lines.join("\n");
}

export function formatRow(row: DashboardRow, selected: boolean, now = Date.now()): string {
  const marker = selected ? ">" : " ";
  const state = row.displayState.padEnd(6);
  const age = formatAge(now - row.lastEventAt).padEnd(5);
  const session = (row.pane?.sessionName ?? row.tmuxSession ?? "?").padEnd(16).slice(0, 16);
  const lastPrompt = (row.lastPrompt ?? "").padEnd(30).slice(0, 30);
  const summary = row.summary.padEnd(24).slice(0, 24);
  const rootPath = shortenPath(row.cwd);
  const unread = row.unread ? "*" : " ";
  return `${marker}${unread}${state} ${age} ${session} ${lastPrompt} ${summary} ${rootPath}`;
}

export function formatAge(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function shortenPath(cwd: string): string {
  const home = process.env.HOME;
  const value = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
  return value.startsWith(process.cwd()) ? relative(process.cwd(), value) || "." : value;
}
