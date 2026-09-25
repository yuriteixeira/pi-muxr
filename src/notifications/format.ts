import type { PiMuxrStatus } from "../domain/status.js";
import { projectName } from "../domain/status.js";

type NotificationStatus = Pick<PiMuxrStatus, "cwd" | "state" | "summary" | "tmuxSession">;

export interface NotificationContent {
  title: string;
  body: string;
}

export function formatNotification(status: NotificationStatus): NotificationContent {
  return {
    title: `${projectName(status.cwd)}@${status.tmuxSession ?? "<unknown session>"}: ${status.state}`,
    body: status.summary,
  };
}
