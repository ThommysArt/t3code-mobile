import * as SQLite from "expo-sqlite";

const DATABASE_NAME = "t3code-minimal.db";
const DATABASE_VERSION = 2;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function migrateDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  const versionRow = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const currentVersion = versionRow?.user_version ?? 0;
  if (currentVersion >= DATABASE_VERSION) {
    return;
  }

  if (currentVersion === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS shell_snapshots (
        environment_id TEXT PRIMARY KEY NOT NULL,
        snapshot_json TEXT NOT NULL,
        snapshot_sequence INTEGER NOT NULL,
        snapshot_received_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS thread_details (
        environment_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        thread_json TEXT NOT NULL,
        snapshot_sequence INTEGER NOT NULL,
        snapshot_received_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (environment_id, thread_id)
      );

      CREATE INDEX IF NOT EXISTS idx_thread_details_environment
        ON thread_details (environment_id);
    `);
  }

  if (currentVersion < 2) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS thread_drafts (
        environment_id TEXT NOT NULL,
        thread_id TEXT NOT NULL,
        draft_text TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (environment_id, thread_id)
      );
    `);
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await migrateDatabase(db);
      return db;
    })();
  }
  return databasePromise;
}
