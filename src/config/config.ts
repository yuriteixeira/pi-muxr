import { readFileSync } from "node:fs";
import type { DashboardConfig } from "../domain/status.js";
import { DEFAULT_ACTIONABLE_STATES, PI_MUXR_STATES } from "../domain/status.js";
import { defaultConfigPath, defaultDatabasePath, defaultStateDir, expandHome } from "./paths.js";

export const DEFAULT_CONFIG: DashboardConfig = {
  stateDir: defaultStateDir(),
  databasePath: defaultDatabasePath(),
  actionableStates: DEFAULT_ACTIONABLE_STATES,
  desktopNotifications: true,
  suppressDesktopNotificationsWhenDashboardOpen: true,
  dashboardBell: true,
  showDismissedRows: false,
  staleAfterMs: 30_000,
  heartbeatIntervalMs: 5_000,
  dashboardPresenceIntervalMs: 2_000,
  dashboardPresenceStaleAfterMs: 5_000,
};

type RawConfig = Partial<Omit<DashboardConfig, "actionableStates">> & { actionableStates?: string[] };

export function loadConfig(configPath = defaultConfigPath()): DashboardConfig {
  let raw: RawConfig = {};
  try {
    raw = JSON.parse(readFileSync(expandHome(configPath), "utf8")) as RawConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }

  const stateDir = expandHome(raw.stateDir ?? DEFAULT_CONFIG.stateDir);
  const databasePath = expandHome(
    raw.databasePath ?? (raw.stateDir ? `${stateDir}/pi-muxr.sqlite` : DEFAULT_CONFIG.databasePath),
  );
  const actionableStates = (raw.actionableStates ?? DEFAULT_CONFIG.actionableStates).filter(
    (state): state is DashboardConfig["actionableStates"][number] => PI_MUXR_STATES.includes(state as never),
  );

  return {
    ...DEFAULT_CONFIG,
    ...raw,
    stateDir,
    databasePath,
    actionableStates: actionableStates.length > 0 ? actionableStates : DEFAULT_CONFIG.actionableStates,
  };
}
