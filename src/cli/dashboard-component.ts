import { Key, matchesKey, truncateToWidth, visibleWidth, type Component } from "@earendil-works/pi-tui";
import type { DashboardRow } from "../domain/status.js";
import { getStateVisual } from "./dashboard-icons.js";
import { chooseDashboardLayout, fitCell, getVisibleRowRange, padToWidth, toRowText, type DashboardLayoutMode } from "./dashboard-layout.js";
import { DEFAULT_DASHBOARD_THEME, type DashboardTheme, type StyleFn } from "./dashboard-theme.js";

export interface DashboardActions {
  moveSelection(delta: number): void;
  selectFirst(): void;
  selectLast(): void;
  refresh(): void;
  focusSelected(): void;
  dismissSelected(): void;
  dismissAllRead(): void;
  quit(): void;
}

export interface DashboardSnapshot {
  rows: DashboardRow[];
  selected: number;
  message: string | null;
}

export interface RenderDashboardOptions extends DashboardSnapshot {
  width: number;
  height: number;
  now?: number;
  theme?: DashboardTheme;
}

export class DashboardComponent implements Component {
  private rows: DashboardRow[] = [];
  private selected = 0;
  private message: string | null = null;
  private cachedWidth: number | undefined;
  private cachedHeight: number | undefined;
  private cachedLines: string[] | undefined;

  constructor(
    private readonly actions: DashboardActions,
    private readonly getHeight: () => number,
    private readonly theme: DashboardTheme = DEFAULT_DASHBOARD_THEME,
  ) {}

  setSnapshot(snapshot: DashboardSnapshot): void {
    this.rows = snapshot.rows;
    this.selected = snapshot.selected;
    this.message = snapshot.message;
    this.invalidate();
  }

  handleInput(data: string): void {
    if (matchesKey(data, Key.up) || matchesKey(data, "k")) this.actions.moveSelection(-1);
    else if (matchesKey(data, Key.down) || matchesKey(data, "j")) this.actions.moveSelection(1);
    else if (matchesKey(data, Key.enter)) this.actions.focusSelected();
    else if (matchesKey(data, "d")) this.actions.dismissSelected();
    else if (matchesKey(data, Key.shift("d")) || data === "D") this.actions.dismissAllRead();
    else if (matchesKey(data, "r")) this.actions.refresh();
    else if (matchesKey(data, "g")) this.actions.selectFirst();
    else if (matchesKey(data, Key.shift("g")) || data === "G") this.actions.selectLast();
    else if (matchesKey(data, "q") || matchesKey(data, Key.escape) || matchesKey(data, Key.ctrl("c"))) this.actions.quit();
  }

  render(width: number): string[] {
    const height = this.getHeight();
    if (this.cachedLines && this.cachedWidth === width && this.cachedHeight === height) return this.cachedLines;
    this.cachedLines = renderDashboardLines({ rows: this.rows, selected: this.selected, message: this.message, width, height, theme: this.theme });
    this.cachedWidth = width;
    this.cachedHeight = height;
    return this.cachedLines;
  }

  invalidate(): void {
    this.cachedWidth = undefined;
    this.cachedHeight = undefined;
    this.cachedLines = undefined;
  }
}

export function renderDashboardLines(options: RenderDashboardOptions): string[] {
  const theme = options.theme ?? DEFAULT_DASHBOARD_THEME;
  const width = Math.max(0, options.width);
  if (width <= 1) return ["".slice(0, width)];

  const height = Math.max(1, options.height);
  const innerWidth = Math.max(0, width - 2);
  const messageLines = renderMessageLines(options.message, innerWidth, theme);
  const mode = chooseDashboardLayout(width);
  const showStatusSection = height >= messageLines.length + 8 && statusSectionFits(options.rows, mode, width, theme);
  const fixedLineCount = 2 + messageLines.length + (showStatusSection ? 5 : 0);
  const bodyHeight = Math.max(1, height - fixedLineCount);
  const rows = renderRowsForViewport(options.rows, options.selected, mode, innerWidth, bodyHeight, options.now ?? Date.now(), theme);
  const statusSection = showStatusSection ? renderStatusSection(options.rows, mode, width, theme) : [];

  const lines = [
    renderHeader(width, theme),
    ...messageLines.map((line) => frameLine(line, width, theme, theme.surface)),
    ...rows.map((line) => frameLine(line.text, width, theme, line.style, line.selected ? theme.accent : undefined)),
    renderBottom(width, theme),
    ...statusSection,
  ];

  return lines.slice(0, height).map((line) => truncateToWidth(line, width, "", false));
}

interface RenderedBodyLine {
  text: string;
  style?: StyleFn;
  selected?: boolean;
}

function renderRowsForViewport(rows: DashboardRow[], selected: number, mode: DashboardLayoutMode, width: number, height: number, now: number, theme: DashboardTheme): RenderedBodyLine[] {
  if (rows.length === 0) return renderEmptyState(width, height, theme);
  return renderTableRows(rows, selected, mode, width, height, now, theme);
}

function renderTableRows(rows: DashboardRow[], selected: number, mode: DashboardLayoutMode, width: number, height: number, now: number, theme: DashboardTheme): RenderedBodyLine[] {
  const reserveHint = rows.length > height && height > 1 ? 1 : 0;
  const range = getVisibleRowRange(rows.length, selected, Math.max(1, height - reserveHint));
  const lines: RenderedBodyLine[] = rows.slice(range.start, range.end).map((row, offset) => {
    const index = range.start + offset;
    const isSelected = index === selected;
    return { text: renderTableRow(row, isSelected, mode, width, now, theme), style: isSelected ? theme.selectedSurface : undefined, selected: isSelected };
  });
  if (reserveHint) lines.push({ text: renderScrollHint(range, width, theme) });
  return padBody(lines, height, width);
}

function renderEmptyState(width: number, height: number, theme: DashboardTheme): RenderedBodyLine[] {
  const empty = theme.muted("No pi sessions found. Start pi in a tmux pane to populate this dashboard.");
  return padBody([{ text: centerLine(empty, width) }], height, width);
}

function renderTableRow(row: DashboardRow, selected: boolean, mode: DashboardLayoutMode, width: number, now: number, theme: DashboardTheme): string {
  const text = toRowText(row, now);
  const visual = getStateVisual(row.displayState, theme);
  const indicator = selected ? theme.accent("❯") : " ";
  const state = `${indicator} ${visual.style(`${visual.icon} ${visual.label}`)}`;
  const summaryStyle = row.unread && row.actionable ? theme.bright : theme.text;
  const innerWidth = Math.max(0, width);
  const columns = mode === "wide"
    ? { session: 16, project: 24, age: 6 }
    : mode === "medium"
      ? { session: 14, project: 22, age: 6 }
      : innerWidth >= 46
        ? { session: 12, project: 18, age: 0 }
        : { session: 10, project: 14, age: 0 };
  const statusWidth = 11;
  const fixedWidth = statusWidth + columns.session + columns.project + columns.age;
  const separatorWidth = [statusWidth, columns.session, columns.project, columns.age].filter((value) => value > 0).length - 1;
  const summaryWidth = Math.max(0, innerWidth - fixedWidth - separatorWidth);
  const cells = [
    padCell(state, statusWidth),
    padCell(theme.info(text.session), columns.session),
    padCell(theme.muted(fitPlainCellEnd(text.project, columns.project)), columns.project),
  ];
  if (columns.age > 0) cells.push(padCell(theme.muted(text.age), columns.age));
  if (summaryWidth > 0) cells.push(summaryStyle(fitPlainCell(text.summary, summaryWidth)));
  return cells.join(" ");
}

function renderHeader(width: number, theme: DashboardTheme): string {
  return renderSectionTop("pi-dash", width, theme, theme.bright);
}

function statusSectionFits(rows: DashboardRow[], mode: DashboardLayoutMode, width: number, theme: DashboardTheme): boolean {
  const contentWidth = Math.max(visibleWidth(renderStats(rows, mode, theme)), visibleWidth(renderFooter(theme)));
  return width >= contentWidth + 2;
}

function renderStatusSection(rows: DashboardRow[], mode: DashboardLayoutMode, width: number, theme: DashboardTheme): string[] {
  return [
    renderSectionTop("status", width, theme),
    frameLine(renderStats(rows, mode, theme), width, theme, theme.surface),
    renderSeparator(width, theme),
    frameLine(renderFooter(theme), width, theme, theme.surface),
    renderBottom(width, theme),
  ];
}

function renderStats(rows: DashboardRow[], mode: DashboardLayoutMode, theme: DashboardTheme): string {
  const actionable = rows.filter((row) => row.actionable).length;
  const unread = rows.filter((row) => row.actionable && row.unread && !row.dismissed).length;
  const stale = rows.filter((row) => row.displayState === "STALE").length;
  const layout = mode === "wide" ? "wide table" : mode === "medium" ? "compact table" : "small table";
  return ` ${theme.warning("●")} ${unread} unread  ${theme.accent("◆")} ${actionable} actionable  ${theme.stale("󰅖")} ${stale} stale  ${theme.muted(layout)}`;
}

function renderFooter(theme: DashboardTheme): string {
  return ` ${theme.accent("↑/↓ j/k")} select  ${theme.accent("↵")} focus/read  ${theme.accent("d")} dismiss  ${theme.accent("D")} dismiss read  ${theme.accent("r")} refresh  ${theme.accent("q")} quit`;
}

function renderMessageLines(message: string | null, width: number, theme: DashboardTheme): string[] {
  if (!message) return [];
  return message.split("\n").slice(0, 3).map((line, index) => {
    const prefix = index === 0 ? ` ${theme.warning("󰋼")} ` : "   ";
    return `${prefix}${fitCell(line, Math.max(0, width - visibleWidth(prefix)))}`;
  });
}

function renderScrollHint(range: { clippedBefore: number; clippedAfter: number }, width: number, theme: DashboardTheme): string {
  const before = range.clippedBefore > 0 ? `${range.clippedBefore} above` : "top";
  const after = range.clippedAfter > 0 ? `${range.clippedAfter} below` : "bottom";
  return centerLine(theme.muted(`— ${before} • ${after} —`), width);
}

function renderSectionTop(title: string, width: number, theme: DashboardTheme, titleStyle: StyleFn = theme.muted): string {
  const innerWidth = Math.max(0, width - 2);
  const label = ` ${titleStyle(title)} `;
  const fillWidth = Math.max(0, innerWidth - visibleWidth(label) - 1);
  const content = fillWidth > 0 ? `${theme.border("─")}${label}${theme.border("─".repeat(fillWidth))}` : fitCell(label, innerWidth);
  return `${theme.border("╭")}${content}${theme.border("╮")}`;
}

function renderSeparator(width: number, theme: DashboardTheme): string {
  return `${theme.border("├")}${theme.border("─".repeat(Math.max(0, width - 2)))}${theme.border("┤")}`;
}

function renderBottom(width: number, theme: DashboardTheme): string {
  return `${theme.border("╰")}${theme.border("─".repeat(Math.max(0, width - 2)))}${theme.border("╯")}`;
}

function frameLine(content: string, width: number, theme: DashboardTheme, style?: StyleFn, borderStyle: StyleFn = theme.border): string {
  const innerWidth = Math.max(0, width - 2);
  const line = padToWidth(content, innerWidth);
  return `${borderStyle("│")}${style ? style(line) : line}${borderStyle("│")}`;
}

function padCell(text: string, width: number): string {
  const fitted = fitCell(text, width);
  return `${fitted}${" ".repeat(Math.max(0, width - visibleWidth(fitted)))}`;
}

function fitPlainCell(text: string, width: number, ellipsis = "…"): string {
  if (width <= 0) return "";
  if (visibleWidth(text) <= width) return text;
  const ellipsisWidth = visibleWidth(ellipsis);
  const targetWidth = Math.max(0, width - ellipsisWidth);
  let result = "";
  for (const char of text) {
    if (visibleWidth(result + char) > targetWidth) break;
    result += char;
  }
  return `${result}${ellipsis}`;
}

function fitPlainCellEnd(text: string, width: number, ellipsis = "…"): string {
  if (width <= 0) return "";
  if (visibleWidth(text) <= width) return text;
  const ellipsisWidth = visibleWidth(ellipsis);
  const targetWidth = Math.max(0, width - ellipsisWidth);
  let result = "";
  for (const char of [...text].reverse()) {
    if (visibleWidth(char + result) > targetWidth) break;
    result = char + result;
  }
  return `${ellipsis}${result}`;
}

function padBody(lines: RenderedBodyLine[], height: number, width: number): RenderedBodyLine[] {
  const padded = lines.slice(0, height);
  while (padded.length < height) padded.push({ text: "" });
  return padded.map((line) => ({ ...line, text: padToWidth(line.text, width) }));
}

function centerLine(text: string, width: number): string {
  const leftPadding = Math.max(0, Math.floor((width - visibleWidth(text)) / 2));
  return padToWidth(`${" ".repeat(leftPadding)}${text}`, width);
}

