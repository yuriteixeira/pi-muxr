#!/usr/bin/env node
import { loadConfig } from "../config/config.js";
import { openDatabase } from "../state/database.js";
import { readStatuses } from "../state/read-statuses.js";
import { listTmuxPanes } from "../tmux/list-panes.js";
import { ensurePinnedSidebar, parseSidebarSide, parseSidebarWindowTarget, toggleSidebar } from "../tmux/sidebar.js";
import { renderRows } from "./format.js";
import { buildDashboardRows } from "./rows.js";
import { runWebServer } from "../web/server.js";
import { runDashboard } from "./dashboard.js";

const HELP = `pi-muxr

Usage:
  pi-muxr                   Open interactive dashboard
  pi-muxr --sidebar [SIDE]  Toggle pinned panes in every tmux window (default: right)
  pi-muxr --list            Print current rows and exit
  pi-muxr --config          Print resolved config
  pi-muxr --web             Serve browser terminal for a pi-muxr tmux session
  pi-muxr --quit-on-select  Exit after Enter focuses the selected row
  pi-muxr --help            Show this help

Keys: ↑/↓ or j/k select, Enter focus/read, d dismiss, D dismiss all read, r refresh, q quit.

Web: set HOST/PORT to change the bind address (defaults to 127.0.0.1:3042).
`;

function main(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return; }

  try {
    const sidebarWindowTarget = parseSidebarWindowTarget(argv);
    if (sidebarWindowTarget) {
      ensurePinnedSidebar(sidebarWindowTarget);
      return;
    }

    const sidebarSide = parseSidebarSide(argv);
    if (sidebarSide) {
      const result = toggleSidebar(sidebarSide);
      console.log(result === "created" ? `Opened and pinned pi-muxr sidebars on the ${sidebarSide}.` : "Closed and unpinned pi-muxr sidebars.");
      return;
    }
  } catch (error) {
    console.error(formatError(error));
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();
  if (argv.includes("--config")) { console.log(JSON.stringify(config, null, 2)); return; }
  if (argv.includes("--web")) { runWebServer(); return; }
  if (argv.includes("--list")) {
    const db = openDatabase(config.databasePath);
    try { console.log(renderRows(buildDashboardRows(readStatuses(db), listTmuxPanes(), config))); }
    finally { db.close(); }
    return;
  }
  runDashboard({ quitOnSelect: argv.includes("--quit-on-select") });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main(process.argv.slice(2));
