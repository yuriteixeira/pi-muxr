import { execFileSync } from "node:child_process";

export type SidebarSide = "left" | "right";
export type SidebarToggleResult = "created" | "destroyed";

export interface SidebarPaneInventory {
  sidebarPaneIds: string[];
  targetPaneIds: string[];
}

const SIDEBAR_OPTION = "@pi-muxr-sidebar";
const SIDEBAR_SIDE_OPTION = "@pi-muxr-sidebar-side";
const SIDEBAR_WINDOW_HOOK = "after-new-window[731]";
const SIDEBAR_PANES_FORMAT = `#{pane_id}\t#{window_id}\t#{${SIDEBAR_OPTION}}`;

export function parseSidebarSide(argv: string[]): SidebarSide | null {
  const optionIndex = argv.indexOf("--sidebar");
  if (optionIndex === -1) return null;

  const side = argv[optionIndex + 1];
  if (side === undefined || side.startsWith("--")) return "right";
  if (side === "left" || side === "right") return side;
  throw new Error("--sidebar accepts only 'left' or 'right'.");
}

export function parseSidebarPaneInventory(output: string): SidebarPaneInventory {
  const sidebarPaneIds: string[] = [];
  const targetPaneIds: string[] = [];
  const seenWindowIds = new Set<string>();

  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const [paneId, windowId, marker] = line.split("\t");
    if (!paneId || !windowId) continue;
    if (marker === "left" || marker === "right") sidebarPaneIds.push(paneId);
    if (seenWindowIds.has(windowId)) continue;
    seenWindowIds.add(windowId);
    targetPaneIds.push(paneId);
  }

  return { sidebarPaneIds, targetPaneIds };
}

export function buildSidebarSplitArgs(side: SidebarSide, targetPaneId: string, command: string): string[] {
  const args = ["split-window", "-d", "-f", "-h", "-l", "25%"];
  if (side === "left") args.push("-b");
  args.push("-t", targetPaneId, "-P", "-F", "#{pane_id}", command);
  return args;
}

export function parseSidebarWindowTarget(argv: string[]): string | null {
  const optionIndex = argv.indexOf("--sidebar-window");
  if (optionIndex === -1) return null;

  const target = argv[optionIndex + 1];
  if (!target || !/^@\d+$/.test(target)) throw new Error("--sidebar-window requires a tmux window ID.");
  return target;
}

export function buildPiMuxrCommand(execPath: string, entrypoint: string): string {
  return `${quoteShellArgument(execPath)} ${quoteShellArgument(entrypoint)}`;
}

export function buildSidebarHookCommand(execPath: string, entrypoint: string): string {
  const command = `${buildPiMuxrCommand(execPath, entrypoint)} --sidebar-window '#{window_id}'`;
  return `run-shell ${quoteShellArgument(command)}`;
}

export function toggleSidebar(side: SidebarSide): SidebarToggleResult {
  if (!process.env.TMUX) throw new Error("--sidebar must be run inside tmux.");

  const inventory = readSidebarPaneInventory();
  if (readPinnedSidebarSide() || inventory.sidebarPaneIds.length > 0) {
    unpinSidebar();
    destroySidebarPanes(inventory.sidebarPaneIds);
    return "destroyed";
  }

  const entrypoint = resolveEntrypoint();
  if (inventory.targetPaneIds.length === 0) throw new Error("No tmux windows are available.");

  const command = buildPiMuxrCommand(process.execPath, entrypoint);
  createSidebarPanes(side, inventory.targetPaneIds, command);
  try {
    pinSidebar(side, buildSidebarHookCommand(process.execPath, entrypoint));
  } catch (error) {
    destroySidebarPanes(readSidebarPaneInventory().sidebarPaneIds);
    throw error;
  }
  return "created";
}

export function ensurePinnedSidebar(targetWindowId: string): boolean {
  const side = readPinnedSidebarSide();
  if (!side) return false;

  const inventory = readSidebarPaneInventory(targetWindowId);
  if (inventory.sidebarPaneIds.length > 0) return false;
  const targetPaneId = inventory.targetPaneIds[0];
  if (!targetPaneId) throw new Error(`No pane is available in tmux window ${targetWindowId}.`);

  createSidebarPanes(side, [targetPaneId], buildPiMuxrCommand(process.execPath, resolveEntrypoint()));
  return true;
}

function resolveEntrypoint(): string {
  const entrypoint = process.argv[1];
  if (!entrypoint) throw new Error("Cannot resolve the pi-muxr entrypoint.");
  return entrypoint;
}

function readSidebarPaneInventory(targetWindowId?: string): SidebarPaneInventory {
  const targetArgs = targetWindowId ? ["-t", targetWindowId] : ["-a"];
  const output = execFileSync("tmux", ["list-panes", ...targetArgs, "-F", SIDEBAR_PANES_FORMAT], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return parseSidebarPaneInventory(output);
}

function readPinnedSidebarSide(): SidebarSide | null {
  try {
    const side = execFileSync("tmux", ["show-option", "-gv", SIDEBAR_SIDE_OPTION], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return side === "left" || side === "right" ? side : null;
  } catch {
    return null;
  }
}

function pinSidebar(side: SidebarSide, hookCommand: string): void {
  execFileSync("tmux", ["set-option", "-g", SIDEBAR_SIDE_OPTION, side], { stdio: "ignore" });
  try {
    execFileSync("tmux", ["set-hook", "-g", SIDEBAR_WINDOW_HOOK, hookCommand], { stdio: "ignore" });
  } catch (error) {
    execFileSync("tmux", ["set-option", "-gu", SIDEBAR_SIDE_OPTION], { stdio: "ignore" });
    throw error;
  }
}

function unpinSidebar(): void {
  execFileSync("tmux", ["set-hook", "-gu", SIDEBAR_WINDOW_HOOK], { stdio: "ignore" });
  execFileSync("tmux", ["set-option", "-gu", SIDEBAR_SIDE_OPTION], { stdio: "ignore" });
}

function createSidebarPanes(side: SidebarSide, targetPaneIds: string[], command: string): void {
  const createdPaneIds: string[] = [];
  try {
    for (const targetPaneId of targetPaneIds) {
      const paneId = execFileSync("tmux", buildSidebarSplitArgs(side, targetPaneId, command), {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
      if (!paneId) throw new Error("tmux did not return the new sidebar pane ID.");

      execFileSync("tmux", ["set-option", "-p", "-t", paneId, SIDEBAR_OPTION, side], { stdio: "ignore" });
      createdPaneIds.push(paneId);
    }
  } catch (error) {
    destroySidebarPanes(createdPaneIds);
    throw error;
  }
}

function destroySidebarPanes(paneIds: string[]): void {
  for (const paneId of paneIds) execFileSync("tmux", ["kill-pane", "-t", paneId], { stdio: "ignore" });
}

function quoteShellArgument(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
