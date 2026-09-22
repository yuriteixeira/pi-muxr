import type { PiDashState } from "../domain/status.js";
import type { DashboardTheme, StyleFn } from "./dashboard-theme.js";

export interface StateVisual {
  icon: string;
  label: PiDashState;
  style: StyleFn;
}

export const RUN_SPINNER_INTERVAL_MS = 80;

const RUN_SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

const STATE_ICONS: Record<Exclude<PiDashState, "RUN">, string> = {
  ASK: "",
  ERROR: "",
  DONE: "",
  QUEUED: "󰔟",
  IDLE: "󰒲",
  STALE: "󰅖",
};

export function getStateIcon(state: PiDashState, now = 0): string {
  if (state === "RUN") return getRunSpinnerFrame(now);
  return STATE_ICONS[state];
}

export function getStateVisual(state: PiDashState, theme: DashboardTheme, now = 0): StateVisual {
  return { icon: getStateIcon(state, now), label: state, style: getStateStyle(state, theme) };
}

function getRunSpinnerFrame(now: number): string {
  const index = Math.floor(now / RUN_SPINNER_INTERVAL_MS) % RUN_SPINNER_FRAMES.length;
  return RUN_SPINNER_FRAMES[index] ?? RUN_SPINNER_FRAMES[0];
}

function getStateStyle(state: PiDashState, theme: DashboardTheme): StyleFn {
  switch (state) {
    case "ASK":
      return theme.warning;
    case "ERROR":
      return theme.error;
    case "DONE":
      return theme.success;
    case "RUN":
      return theme.info;
    case "QUEUED":
      return theme.purple;
    case "IDLE":
    case "STALE":
      return theme.stale;
  }
}
