import { execFileSync } from "node:child_process";

export type SidebarSide = "left" | "right";
export type SidebarToggleResult = "created" | "destroyed";

export interface SidebarPaneInventory {
  sidebarPaneIds: string[];
  targetPaneIds: string[];
}

const SIDEBAR_OPTION = "@pi-dash-sidebar";
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

export function buildPiDashCommand(execPath: string, entrypoint: string): string {
  return `${quoteShellArgument(execPath)} ${quoteShellArgument(entrypoint)}`;
}

export function toggleSidebar(side: SidebarSide): SidebarToggleResult {
  if (!process.env.TMUX) throw new Error("--sidebar must be run inside tmux.");

  const inventory = readSidebarPaneInventory();
  if (inventory.sidebarPaneIds.length > 0) {
    destroySidebarPanes(inventory.sidebarPaneIds);
    return "destroyed";
  }

  const entrypoint = process.argv[1];
  if (!entrypoint) throw new Error("Cannot resolve the pi-dash entrypoint.");
  if (inventory.targetPaneIds.length === 0) throw new Error("No tmux windows are available.");

  createSidebarPanes(side, inventory.targetPaneIds, buildPiDashCommand(process.execPath, entrypoint));
  return "created";
}

function readSidebarPaneInventory(): SidebarPaneInventory {
  const output = execFileSync("tmux", ["list-panes", "-a", "-F", SIDEBAR_PANES_FORMAT], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return parseSidebarPaneInventory(output);
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
