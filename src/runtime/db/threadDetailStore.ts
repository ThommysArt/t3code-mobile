import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import {
  EnvironmentId,
  OrchestrationThread,
  ThreadId,
  type EnvironmentId as EnvironmentIdType,
  type ThreadId as ThreadIdType,
} from "@t3tools/contracts";

import { getDatabase } from "./database";

const THREAD_DETAIL_CACHE_SCHEMA_VERSION = 1;

export interface CachedThreadDetail {
  readonly schemaVersion: typeof THREAD_DETAIL_CACHE_SCHEMA_VERSION;
  readonly environmentId: EnvironmentIdType;
  readonly threadId: ThreadIdType;
  readonly snapshotReceivedAt: string;
  readonly snapshotSequence: number;
  readonly thread: OrchestrationThread;
}

const CachedThreadDetailSchema = Schema.Struct({
  schemaVersion: Schema.Literal(THREAD_DETAIL_CACHE_SCHEMA_VERSION),
  environmentId: EnvironmentId,
  threadId: ThreadId,
  snapshotReceivedAt: Schema.String,
  snapshotSequence: Schema.Number,
  thread: OrchestrationThread,
});

const decodeCachedThreadDetail = Schema.decodeUnknownOption(CachedThreadDetailSchema);

export async function loadCachedThreadDetail(
  environmentId: EnvironmentIdType,
  threadId: ThreadIdType
): Promise<CachedThreadDetail | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      thread_json: string;
      snapshot_sequence: number;
      snapshot_received_at: string;
    }>(
      `SELECT thread_json, snapshot_sequence, snapshot_received_at
       FROM thread_details
       WHERE environment_id = ? AND thread_id = ?`,
      [environmentId, threadId]
    );
    if (!row) {
      return null;
    }

    const parsed = JSON.parse(row.thread_json) as unknown;
    const decoded = decodeCachedThreadDetail({
      schemaVersion: THREAD_DETAIL_CACHE_SCHEMA_VERSION,
      environmentId,
      threadId,
      snapshotReceivedAt: row.snapshot_received_at,
      snapshotSequence: row.snapshot_sequence,
      thread: parsed,
    });
    if (
      Option.isNone(decoded) ||
      decoded.value.environmentId !== environmentId ||
      decoded.value.threadId !== threadId
    ) {
      return null;
    }

    return decoded.value;
  } catch {
    return null;
  }
}

export async function saveCachedThreadDetail(
  environmentId: EnvironmentIdType,
  threadId: ThreadIdType,
  thread: OrchestrationThread,
  snapshotSequence: number
): Promise<void> {
  try {
    const db = await getDatabase();
    const snapshotReceivedAt = new Date().toISOString();
    const updatedAt = snapshotReceivedAt;
    await db.runAsync(
      `INSERT INTO thread_details (
        environment_id,
        thread_id,
        thread_json,
        snapshot_sequence,
        snapshot_received_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(environment_id, thread_id) DO UPDATE SET
        thread_json = excluded.thread_json,
        snapshot_sequence = excluded.snapshot_sequence,
        snapshot_received_at = excluded.snapshot_received_at,
        updated_at = excluded.updated_at`,
      environmentId,
      threadId,
      JSON.stringify(thread),
      snapshotSequence,
      snapshotReceivedAt,
      updatedAt
    );
  } catch {
    // Cache persistence is best-effort and should never block live data.
  }
}

export async function clearCachedThreadDetail(
  environmentId: EnvironmentIdType,
  threadId: ThreadIdType
): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync(
      "DELETE FROM thread_details WHERE environment_id = ? AND thread_id = ?",
      environmentId,
      threadId
    );
  } catch {
    // Ignore cache cleanup failures.
  }
}

export async function clearCachedThreadDetailsForEnvironment(
  environmentId: EnvironmentIdType
): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync("DELETE FROM thread_details WHERE environment_id = ?", environmentId);
  } catch {
    // Ignore cache cleanup failures.
  }
}
