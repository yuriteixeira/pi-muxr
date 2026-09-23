import type { Database } from "./database.js";

export interface DatabaseMigration {
  version: number;
  apply(db: Database): void;
}

const DATABASE_MIGRATIONS: DatabaseMigration[] = [];

export function applyDatabaseMigrations(db: Database, migrations: DatabaseMigration[] = DATABASE_MIGRATIONS): void {
  validateMigrationOrder(migrations);
  db.exec("BEGIN IMMEDIATE");
  try {
    const currentVersion = readDatabaseVersion(db);
    const latestVersion = migrations.at(-1)?.version ?? 0;
    if (currentVersion > latestVersion) throw new Error(`Database schema version ${currentVersion} is newer than supported version ${latestVersion}`);

    for (const migration of migrations) {
      if (migration.version <= currentVersion) continue;
      migration.apply(db);
      db.exec(`PRAGMA user_version = ${migration.version}`);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function validateMigrationOrder(migrations: DatabaseMigration[]): void {
  for (let index = 0; index < migrations.length; index += 1) {
    const expectedVersion = index + 1;
    if (migrations[index]?.version !== expectedVersion) throw new Error(`Database migration version ${expectedVersion} is missing or out of order`);
  }
}

function readDatabaseVersion(db: Database): number {
  const row = db.prepare("PRAGMA user_version").get() as { user_version?: number } | undefined;
  return row?.user_version ?? 0;
}
