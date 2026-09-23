import { relative } from "node:path";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { DashboardRow } from "../domain/status.js";
import { formatAge } from "./format.js";

export type DashboardLayoutMode = "wide" | "medium" | "narrow";

export interface RowText {
  age: string;
  lastPrompt: string;
  rootPath: string;
  session: string;
  summary: string;
}

export interface VisibleRange {
  start: number;
  end: number;
  clippedBefore: number;
  clippedAfter: number;
}

export function chooseDashboardLayout(width: number): DashboardLayoutMode {
  if (width >= 120) return "wide";
  if (width >= 80) return "medium";
  return "narrow";
}

export function getVisibleRowRange(totalRows: number, selected: number, maxRows: number): VisibleRange {
  if (totalRows <= 0 || maxRows <= 0) return { start: 0, end: 0, clippedBefore: 0, clippedAfter: totalRows };
  const safeSelected = Math.min(Math.max(selected, 0), totalRows - 1);
  const count = Math.min(totalRows, maxRows);
  const centeredStart = safeSelected - Math.floor(count / 2);
  const start = Math.min(Math.max(centeredStart, 0), totalRows - count);
  const end = start + count;
  return { start, end, clippedBefore: start, clippedAfter: totalRows - end };
}

export function toRowText(row: DashboardRow, now = Date.now()): RowText {
  return {
    age: shouldRunRowTimer(row) ? formatAge(now - row.lastEventAt) : "",
    lastPrompt: row.lastPrompt ?? "",
    rootPath: shortenPath(row.cwd),
    session: row.pane?.sessionName ?? row.tmuxSession ?? "?",
    summary: row.summary,
  };
}

function shouldRunRowTimer(row: DashboardRow): boolean {
  return row.displayState === "RUN" || row.displayState === "ASK" || row.displayState === "QUEUED";
}

export function shortenPath(cwd: string): string {
  const home = process.env.HOME;
  const value = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
  return value.startsWith(process.cwd()) ? relative(process.cwd(), value) || "." : value;
}

export function fitCell(text: string, width: number, ellipsis = "…"): string {
  if (width <= 0) return "";
  return truncateToWidth(text, width, ellipsis, true);
}

export function padToWidth(text: string, width: number): string {
  if (width <= 0) return "";
  const currentWidth = visibleWidth(text);
  if (currentWidth > width) return truncateToWidth(text, width, "…", true);
  return text + " ".repeat(width - currentWidth);
}
