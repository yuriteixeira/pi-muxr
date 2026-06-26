import type { PiDashState } from "../domain/status.js";
import type { DashboardTheme, StyleFn } from "./dashboard-theme.js";

export interface StateVisual {
  icon: string;
  label: PiDashState;
  style: StyleFn;
}

const STATE_ICONS: Record<PiDashState, string> = {
  ASK: "",
  ERROR: "",
  DONE: "",
  RUN: "",
  QUEUED: "󰔟",
  IDLE: "󰒲",
  STALE: "󰅖",
};

export function getStateIcon(state: PiDashState): string {
  return STATE_ICONS[state];
}

export function getStateVisual(state: PiDashState, theme: DashboardTheme): StateVisual {
  return { icon: getStateIcon(state), label: state, style: getStateStyle(state, theme) };
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
