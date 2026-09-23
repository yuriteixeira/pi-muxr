import type { DashboardConfig, PiMuxrState } from "../domain/status.js";

export function shouldRingTerminalBell(
  config: Pick<DashboardConfig, "actionableStates" | "dashboardBell">,
  state: PiMuxrState,
  previousState: PiMuxrState | null,
): boolean {
  return config.dashboardBell && config.actionableStates.includes(state) && state !== previousState;
}

export function ringTerminalBell(): void {
  process.stdout.write("\x07");
}
