import type { OrchestrationMessage, OrchestrationThreadActivity, TurnId } from "@t3tools/contracts";

export interface WorkLogRow {
  readonly id: string;
  readonly createdAt: string;
  readonly summary: string;
  readonly detail: string | null;
  readonly tone: OrchestrationThreadActivity["tone"];
}

export type ThreadFeedEntry =
  | {
      readonly type: "message";
      readonly id: string;
      readonly message: OrchestrationMessage;
    }
  | {
      readonly type: "work-log";
      readonly id: string;
      readonly turnId: TurnId | null;
      readonly rows: readonly WorkLogRow[];
      readonly startedAt: string;
      readonly completedAt: string;
    };

function payloadRecord(activity: OrchestrationThreadActivity): Record<string, unknown> | null {
  return activity.payload && typeof activity.payload === "object"
    ? (activity.payload as Record<string, unknown>)
    : null;
}

function payloadText(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function shouldShowActivity(activity: OrchestrationThreadActivity): boolean {
  return (
    activity.kind !== "tool.started" &&
    activity.kind !== "task.started" &&
    activity.kind !== "task.completed" &&
    activity.kind !== "context-window.updated" &&
    activity.summary !== "Checkpoint captured"
  );
}

function activityRow(activity: OrchestrationThreadActivity): WorkLogRow {
  const payload = payloadRecord(activity);
  const reasoning = activity.kind === "task.progress";
  const detail =
    payloadText(payload, reasoning ? "summary" : "detail") ??
    payloadText(payload, "detail") ??
    payloadText(payload, "message");

  return {
    id: activity.id,
    createdAt: activity.createdAt,
    summary: reasoning && detail ? detail : activity.summary,
    detail: reasoning ? null : detail,
    tone: activity.tone,
  };
}

function collapseRows(rows: readonly WorkLogRow[]): WorkLogRow[] {
  const collapsed: WorkLogRow[] = [];
  for (const row of rows) {
    const previous = collapsed.at(-1);
    if (
      previous &&
      previous.summary === row.summary &&
      previous.detail === row.detail &&
      previous.tone === row.tone
    ) {
      collapsed[collapsed.length - 1] = row;
    } else {
      collapsed.push(row);
    }
  }
  return collapsed;
}

export function buildThreadFeed(
  messages: readonly OrchestrationMessage[],
  activities: readonly OrchestrationThreadActivity[]
): ThreadFeedEntry[] {
  const activityGroups = new Map<TurnId | null, OrchestrationThreadActivity[]>();
  for (const activity of activities) {
    const group = activityGroups.get(activity.turnId) ?? [];
    group.push(activity);
    activityGroups.set(activity.turnId, group);
  }

  for (const group of activityGroups.values()) {
    group.sort(
      (left, right) =>
        (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER) ||
        left.createdAt.localeCompare(right.createdAt)
    );
  }

  const feed: ThreadFeedEntry[] = [];
  const emittedTurns = new Set<TurnId | null>();
  const orderedMessages = [...messages].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt)
  );

  const emitWorkLog = (turnId: TurnId | null) => {
    if (emittedTurns.has(turnId)) return;
    const group = activityGroups.get(turnId);
    if (!group?.length) return;
    const rows = collapseRows(group.filter(shouldShowActivity).map(activityRow));
    if (rows.length === 0) return;
    emittedTurns.add(turnId);
    feed.push({
      type: "work-log",
      id: `work:${turnId ?? group[0]!.id}`,
      turnId,
      rows,
      startedAt: group[0]!.createdAt,
      completedAt: group.at(-1)!.createdAt,
    });
  };

  for (const message of orderedMessages) {
    if (message.role === "assistant" && message.turnId !== null) {
      emitWorkLog(message.turnId);
    }
    feed.push({ type: "message", id: message.id, message });
  }

  for (const [turnId] of activityGroups) {
    emitWorkLog(turnId);
  }

  return feed;
}

export function formatWorkDuration(startedAt: string, completedAt: string): string {
  const durationSeconds = Math.max(
    0,
    Math.round((Date.parse(completedAt) - Date.parse(startedAt)) / 1000)
  );
  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}
