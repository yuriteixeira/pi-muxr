import { relative } from "node:path";
import type { DashboardRow } from "../domain/status.js";

export function renderRows(rows: DashboardRow[], selected = 0, now = Date.now()): string {
  const lines = ["STATE   AGE   SESSION/WINDOW.PANE       PROJECT                LAST EVENT"];
  rows.forEach((row, index) => lines.push(formatRow(row, index === selected, now)));
  if (rows.length === 0) lines.push("No pi sessions found.");
  return lines.join("\n");
}

export function formatRow(row: DashboardRow, selected: boolean, now = Date.now()): string {
  const marker = selected ? ">" : " ";
  const state = row.displayState.padEnd(6);
  const age = formatAge(now - row.lastEventAt).padEnd(5);
  const pane = formatPane(row).padEnd(25).slice(0, 25);
  const project = shortenPath(row.cwd).padEnd(22).slice(0, 22);
  const unread = row.unread ? "*" : " ";
  return `${marker}${unread}${state} ${age} ${pane} ${project} ${row.summary}`;
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

function formatPane(row: DashboardRow): string {
  const session = row.pane?.sessionName ?? row.tmuxSession ?? "?";
  const windowIndex = row.pane?.windowIndex ?? row.tmuxWindowIndex ?? "?";
  const paneId = row.pane?.paneId ?? row.paneId ?? "?";
  const windowName = row.pane?.windowName ?? row.tmuxWindow ?? "";
  return `${session}:${windowIndex}${windowName ? `:${windowName}` : ""}.${paneId}`;
}

function shortenPath(cwd: string): string {
  const home = process.env.HOME;
  const value = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
  return value.startsWith(process.cwd()) ? relative(process.cwd(), value) || "." : value;
}
