import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  EnvironmentId,
  OrchestrationShellSnapshot,
  type EnvironmentId as EnvironmentIdType,
} from "@t3tools/contracts";

import { logStatus } from "../statusLog";
import { getDatabase } from "./database";

const SHELL_SNAPSHOT_CACHE_SCHEMA_VERSION = 1;

export interface CachedShellSnapshot {
  readonly schemaVersion: typeof SHELL_SNAPSHOT_CACHE_SCHEMA_VERSION;
  readonly environmentId: EnvironmentIdType;
  readonly snapshotReceivedAt: string;
  readonly snapshot: OrchestrationShellSnapshot;
}

const CachedShellSnapshotSchema = Schema.Struct({
  schemaVersion: Schema.Literal(SHELL_SNAPSHOT_CACHE_SCHEMA_VERSION),
  environmentId: EnvironmentId,
  snapshotReceivedAt: Schema.String,
  snapshot: OrchestrationShellSnapshot,
});

const decodeCachedShellSnapshot = Schema.decodeUnknownOption(CachedShellSnapshotSchema);

export async function loadCachedShellSnapshot(
  environmentId: EnvironmentIdType
): Promise<CachedShellSnapshot | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      snapshot_json: string;
      snapshot_received_at: string;
    }>("SELECT snapshot_json, snapshot_received_at FROM shell_snapshots WHERE environment_id = ?", [
      environmentId,
    ]);
    if (!row) {
      return null;
    }

    const parsed = JSON.parse(row.snapshot_json) as unknown;
    const decoded = decodeCachedShellSnapshot({
      schemaVersion: SHELL_SNAPSHOT_CACHE_SCHEMA_VERSION,
      environmentId,
      snapshotReceivedAt: row.snapshot_received_at,
      snapshot: parsed,
    });
    if (Option.isNone(decoded) || decoded.value.environmentId !== environmentId) {
      logStatus("db", "warning", "Invalid cached shell", `Skipped cache for ${environmentId}`);
      return null;
    }

    return decoded.value;
  } catch (error) {
    logStatus(
      "db",
      "warning",
      "Failed to read cached shell",
      error instanceof Error ? error.message : String(error),
      { environmentId }
    );
    return null;
  }
}

export async function loadAllCachedShellSnapshots(): Promise<readonly CachedShellSnapshot[]> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{
      environment_id: string;
      snapshot_json: string;
      snapshot_received_at: string;
    }>("SELECT environment_id, snapshot_json, snapshot_received_at FROM shell_snapshots");

    const snapshots: CachedShellSnapshot[] = [];
    for (const row of rows) {
      const environmentId = EnvironmentId.make(row.environment_id);
      const parsed = JSON.parse(row.snapshot_json) as unknown;
      const decoded = decodeCachedShellSnapshot({
        schemaVersion: SHELL_SNAPSHOT_CACHE_SCHEMA_VERSION,
        environmentId,
        snapshotReceivedAt: row.snapshot_received_at,
        snapshot: parsed,
      });
      if (Option.isSome(decoded) && decoded.value.environmentId === environmentId) {
        snapshots.push(decoded.value);
      }
    }
    return snapshots;
  } catch (error) {
    logStatus(
      "db",
      "warning",
      "Failed to load shell snapshots",
      error instanceof Error ? error.message : String(error)
    );
    return [];
  }
}

export async function saveCachedShellSnapshot(
  environmentId: EnvironmentIdType,
  snapshot: OrchestrationShellSnapshot
): Promise<void> {
  try {
    const db = await getDatabase();
    const snapshotReceivedAt = new Date().toISOString();
    const updatedAt = snapshotReceivedAt;
    await db.runAsync(
      `INSERT INTO shell_snapshots (
        environment_id,
        snapshot_json,
        snapshot_sequence,
        snapshot_received_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(environment_id) DO UPDATE SET
        snapshot_json = excluded.snapshot_json,
        snapshot_sequence = excluded.snapshot_sequence,
        snapshot_received_at = excluded.snapshot_received_at,
        updated_at = excluded.updated_at`,
      environmentId,
      JSON.stringify(snapshot),
      snapshot.snapshotSequence,
      snapshotReceivedAt,
      updatedAt
    );
  } catch (error) {
    logStatus(
      "db",
      "warning",
      "Failed to save shell snapshot",
      error instanceof Error ? error.message : String(error),
      { environmentId }
    );
  }
}

export async function clearCachedShellSnapshot(environmentId: EnvironmentIdType): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM shell_snapshots WHERE environment_id = ?", environmentId);
  } catch {
    // Ignore cache cleanup failures.
  }
}
