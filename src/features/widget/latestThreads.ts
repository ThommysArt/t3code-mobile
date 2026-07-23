import type { EnvironmentScopedThreadShell } from "@t3tools/client-runtime";
import { effectiveSettled } from "@t3tools/client-runtime";
import type { EnvironmentId } from "@t3tools/contracts";

import {
  resolveThreadListV2Status,
  sortThreadsForListV2,
  type ThreadListV2Status,
} from "../home/threadListV2";

/** Max rows shown on the home-screen widget. */
export const LATEST_THREADS_WIDGET_LIMIT = 5;

export const LATEST_THREADS_WIDGET_NAME = "LatestThreads";

export type LatestThreadWidgetVariant = "active" | "settled";

export interface LatestThreadWidgetItem {
  readonly thread: EnvironmentScopedThreadShell;
  readonly variant: LatestThreadWidgetVariant;
  readonly status: ThreadListV2Status;
  readonly projectTitle: string | null;
}

export interface LatestThreadsWidgetSelection {
  readonly items: readonly LatestThreadWidgetItem[];
  readonly activeCount: number;
  readonly settledCount: number;
  readonly totalThreadCount: number;
}

function firstValidTimestampMs(...candidates: ReadonlyArray<string | null | undefined>): number {
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

/**
 * Pick threads for the home-screen widget, matching beta sidebar priorities:
 * show all unsettled (active) work first; only fill with settled threads when
 * there are fewer than {@link LATEST_THREADS_WIDGET_LIMIT} active ones.
 */
export function selectLatestThreadsForWidget(input: {
  readonly threads: ReadonlyArray<EnvironmentScopedThreadShell>;
  readonly projectTitleByKey?: ReadonlyMap<string, string>;
  /**
   * Environments whose server supports thread.settle/unsettle. Threads on
   * other environments never classify as settled. Absent = no gating.
   */
  readonly settlementEnvironmentIds?: ReadonlySet<EnvironmentId>;
  readonly autoSettleAfterDays?: number | null;
  readonly changeRequestStateByKey?: ReadonlyMap<string, "open" | "closed" | "merged">;
  readonly limit?: number;
  readonly now?: string;
}): LatestThreadsWidgetSelection {
  const now = input.now ?? new Date().toISOString();
  const autoSettleAfterDays =
    input.autoSettleAfterDays === undefined ? 3 : input.autoSettleAfterDays;
  const limit = input.limit ?? LATEST_THREADS_WIDGET_LIMIT;

  const active: EnvironmentScopedThreadShell[] = [];
  const settled: EnvironmentScopedThreadShell[] = [];

  for (const thread of input.threads) {
    const supportsSettlement = input.settlementEnvironmentIds?.has(thread.environmentId) ?? true;
    const changeRequestState =
      input.changeRequestStateByKey?.get(`${thread.environmentId}:${thread.id}`) ?? null;
    if (
      supportsSettlement &&
      effectiveSettled(thread, { now, autoSettleAfterDays, changeRequestState })
    ) {
      settled.push(thread);
    } else {
      active.push(thread);
    }
  }

  const orderedActive = sortThreadsForListV2(active);
  const orderedSettled = [...settled].sort(
    (left, right) =>
      firstValidTimestampMs(right.latestUserMessageAt, right.updatedAt) -
      firstValidTimestampMs(left.latestUserMessageAt, left.updatedAt)
  );

  // Always surface active work. Only pad with settled when under the limit.
  const visibleActive = orderedActive.slice(0, limit);
  const settledSlots =
    visibleActive.length < limit ? Math.min(orderedSettled.length, limit - visibleActive.length) : 0;
  const visibleSettled = orderedSettled.slice(0, settledSlots);

  const toItem = (
    thread: EnvironmentScopedThreadShell,
    variant: LatestThreadWidgetVariant
  ): LatestThreadWidgetItem => ({
    thread,
    variant,
    status: resolveThreadListV2Status(thread),
    projectTitle:
      input.projectTitleByKey?.get(`${thread.environmentId}:${thread.projectId}`) ?? null,
  });

  return {
    items: [
      ...visibleActive.map((thread) => toItem(thread, "active")),
      ...visibleSettled.map((thread) => toItem(thread, "settled")),
    ],
    activeCount: orderedActive.length,
    settledCount: orderedSettled.length,
    totalThreadCount: input.threads.length,
  };
}

export function threadWidgetDeepLink(environmentId: string, threadId: string): string {
  return `t3code-mobile://threads/${encodeURIComponent(environmentId)}/${encodeURIComponent(threadId)}`;
}

export function formatWidgetRelativeTime(value: string, nowMs: number = Date.now()): string {
  const elapsedSeconds = Math.max(0, Math.floor((nowMs - Date.parse(value)) / 1_000));
  if (!Number.isFinite(elapsedSeconds) || Number.isNaN(elapsedSeconds)) return "";
  if (elapsedSeconds < 60) return `${elapsedSeconds}s`;
  const minutes = Math.floor(elapsedSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function statusLabel(status: ThreadListV2Status): string {
  switch (status) {
    case "approval":
      return "Approval";
    case "input":
      return "Input";
    case "working":
      return "Working";
    case "failed":
      return "Failed";
    case "ready":
      return "Ready";
  }
}
