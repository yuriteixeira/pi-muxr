import type { DashboardRow } from "../domain/status.js";

export type ClientMessage = { type: "input"; data: string } | { type: "resize"; cols: number; rows: number };

export type ServerMessage =
  | { type: "output"; data: string }
  | { type: "exit"; code?: number }
  | { type: "error"; message: string }
  | { type: "notification"; title: string; body: string; row: NotificationRow };

export type NotificationRow = Pick<
  DashboardRow,
  "id" | "state" | "severity" | "summary" | "cwd" | "tmuxSession" | "tmuxWindowIndex" | "paneId" | "lastEventAt"
>;
