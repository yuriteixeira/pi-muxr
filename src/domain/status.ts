export const PI_MUXR_STATES = ["ASK", "ERROR", "DONE", "QUEUED", "RUN", "IDLE", "STALE"] as const;
export type PiMuxrState = (typeof PI_MUXR_STATES)[number];

export const SEVERITIES = ["low", "medium", "high"] as const;
export type PiMuxrSeverity = (typeof SEVERITIES)[number];

export interface PiMuxrStatus {
  id: string;
  paneId: string | null;
  tmuxSession: string | null;
  tmuxWindow: string | null;
  tmuxWindowIndex: string | null;
  pid: number;
  cwd: string;
  piSessionFile: string | null;
  model: string | null;
  state: PiMuxrState;
  severity: PiMuxrSeverity;
  summary: string;
  lastPrompt?: string | null;
  lastEventAt: number;
  heartbeatAt: number;
  readUntilEventAt?: number | null;
  acknowledgedAt?: number | null;
  dismissedUntilEventAt?: number | null;
  lastNotifiedEventAt?: number | null;
}

export interface DashboardConfig {
  stateDir: string;
  databasePath: string;
  actionableStates: PiMuxrState[];
  desktopNotifications: boolean;
  suppressDesktopNotificationsWhenDashboardOpen: boolean;
  dashboardBell: boolean;
  showDismissedRows: boolean;
  staleAfterMs: number;
  heartbeatIntervalMs: number;
  dashboardPresenceIntervalMs: number;
  dashboardPresenceStaleAfterMs: number;
}

export interface TmuxPane {
  sessionName: string;
  windowIndex: string;
  windowName: string;
  paneId: string;
  paneActive: boolean;
  currentCommand: string;
  paneTitle: string;
  panePid: number;
}

export interface DashboardRow extends PiMuxrStatus {
  displayState: PiMuxrState;
  pane: TmuxPane | null;
  actionable: boolean;
  unread: boolean;
  dismissed: boolean;
  staleReason?: string;
}

export const DEFAULT_ACTIONABLE_STATES: PiMuxrState[] = ["ASK", "ERROR", "DONE"];

export function isActionableStatus(status: Pick<PiMuxrStatus, "state" | "lastEventAt" | "dismissedUntilEventAt">, actionableStates = DEFAULT_ACTIONABLE_STATES): boolean {
  return actionableStates.includes(status.state) && !isDismissedForCurrentEvent(status);
}

export function isUnreadStatus(status: Pick<PiMuxrStatus, "lastEventAt" | "readUntilEventAt" | "dismissedUntilEventAt">): boolean {
  return !isDismissedForCurrentEvent(status) && (status.readUntilEventAt ?? 0) < status.lastEventAt;
}

export function isDismissedForCurrentEvent(status: Pick<PiMuxrStatus, "lastEventAt" | "dismissedUntilEventAt">): boolean {
  return (status.dismissedUntilEventAt ?? 0) >= status.lastEventAt;
}

export function projectName(cwd: string): string {
  const normalized = cwd.replace(/\/$/, "");
  return normalized.split("/").filter(Boolean).at(-1) ?? cwd;
}
