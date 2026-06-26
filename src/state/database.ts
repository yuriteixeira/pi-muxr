import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { parentDir } from "../config/paths.js";
import { SCHEMA_SQL } from "./schema.js";

export type Database = DatabaseSync;

export function openDatabase(databasePath: string): Database {
  mkdirSync(parentDir(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 3000;");
  db.exec(SCHEMA_SQL);
  return db;
}
