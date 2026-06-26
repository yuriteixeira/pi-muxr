import type { PiDashStatus } from "../domain/status.js";
import type { Database } from "./database.js";
import { toStatus } from "./rows.js";

export function readStatuses(db: Database): PiDashStatus[] {
  return db.prepare("SELECT * FROM sessions").all().map((row) => toStatus(row as never));
}
