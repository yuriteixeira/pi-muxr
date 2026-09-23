import type { PiMuxrStatus } from "../domain/status.js";
import type { Database } from "./database.js";
import { toStatus } from "./rows.js";

export function readStatuses(db: Database): PiMuxrStatus[] {
  return db
    .prepare("SELECT * FROM sessions")
    .all()
    .map((row) => toStatus(row as never));
}
