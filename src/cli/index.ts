#!/usr/bin/env node
import { loadConfig } from "../config/config.js";
import { openDatabase } from "../state/database.js";
import { readStatuses } from "../state/read-statuses.js";
import { listTmuxPanes } from "../tmux/list-panes.js";
import { renderRows } from "./format.js";
import { buildDashboardRows } from "./rows.js";
import { runDashboard } from "./dashboard.js";

const HELP = `pi-dash

Usage:
  pi-dash              Open interactive dashboard
  pi-dash --list       Print current rows and exit
  pi-dash --config     Print resolved config
  pi-dash --help       Show this help

Keys: ↑/↓ or j/k select, Enter focus/read, d dismiss, D dismiss all read, r refresh, q quit.
`;

function main(argv: string[]): void {
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return; }
  const config = loadConfig();
  if (argv.includes("--config")) { console.log(JSON.stringify(config, null, 2)); return; }
  if (argv.includes("--list")) {
    const db = openDatabase(config.databasePath);
    try { console.log(renderRows(buildDashboardRows(readStatuses(db), listTmuxPanes(), config))); }
    finally { db.close(); }
    return;
  }
  runDashboard();
}

main(process.argv.slice(2));
