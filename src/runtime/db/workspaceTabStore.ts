import type { WorkspaceTab } from "@/features/workspace/workspaceTypes";

import { getDatabase } from "./database";

export interface PersistedWorkspaceTabs {
  readonly tabs: readonly WorkspaceTab[];
  readonly activeTabId: string;
  readonly updatedAt: string;
}

function parseWorkspaceTabs(raw: string): PersistedWorkspaceTabs | null {
  try {
    const parsed = JSON.parse(raw) as PersistedWorkspaceTabs;
    if (!Array.isArray(parsed.tabs) || typeof parsed.activeTabId !== "string") {
      return null;
    }
    if (parsed.tabs.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function loadWorkspaceTabs(
  environmentId: string,
  threadId: string
): Promise<PersistedWorkspaceTabs | null> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ tabs_json: string }>(
      `SELECT tabs_json
       FROM workspace_tabs
       WHERE environment_id = ? AND thread_id = ?`,
      environmentId,
      threadId
    );
    if (!row?.tabs_json) {
      return null;
    }
    return parseWorkspaceTabs(row.tabs_json);
  } catch {
    return null;
  }
}

export async function saveWorkspaceTabs(
  environmentId: string,
  threadId: string,
  state: PersistedWorkspaceTabs
): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO workspace_tabs (environment_id, thread_id, tabs_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(environment_id, thread_id) DO UPDATE SET
         tabs_json = excluded.tabs_json,
         updated_at = excluded.updated_at`,
      environmentId,
      threadId,
      JSON.stringify(state),
      state.updatedAt
    );
  } catch {
    // Tab persistence is best-effort.
  }
}