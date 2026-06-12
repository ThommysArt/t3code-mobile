import { getDatabase } from "./database";

export async function loadThreadDraft(environmentId: string, threadId: string): Promise<string> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ draft_text: string }>(
      `SELECT draft_text
       FROM thread_drafts
       WHERE environment_id = ? AND thread_id = ?`,
      [environmentId, threadId]
    );
    return row?.draft_text ?? "";
  } catch {
    return "";
  }
}

export async function saveThreadDraft(
  environmentId: string,
  threadId: string,
  draft: string
): Promise<void> {
  try {
    const db = await getDatabase();
    if (!draft) {
      await db.runAsync(
        "DELETE FROM thread_drafts WHERE environment_id = ? AND thread_id = ?",
        environmentId,
        threadId
      );
      return;
    }

    await db.runAsync(
      `INSERT INTO thread_drafts (environment_id, thread_id, draft_text, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(environment_id, thread_id) DO UPDATE SET
         draft_text = excluded.draft_text,
         updated_at = excluded.updated_at`,
      environmentId,
      threadId,
      draft,
      new Date().toISOString()
    );
  } catch {
    // Draft persistence is best-effort and must not interrupt composing.
  }
}
