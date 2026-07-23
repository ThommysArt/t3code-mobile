import type { EnvironmentScopedThreadShell } from "@t3tools/client-runtime";
import { effectiveSettled } from "@t3tools/client-runtime";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";

/**
 * Thread List v2 model, ported from official T3 Code sidebar/thread-list v2.
 *
 * Active work renders as rich cards; settled work collapses into a slim
 * recency tail. Sort is static creation order — activity never reorders rows.
 */

export type ThreadListV2Status = "approval" | "input" | "working" | "failed" | "ready";

export const THREAD_LIST_V2_SETTLED_INITIAL_COUNT = 10;
export const THREAD_LIST_V2_SETTLED_PAGE_COUNT = 25;

export function resolveThreadListV2Status(
  thread: Pick<
    EnvironmentScopedThreadShell,
    "hasPendingApprovals" | "hasPendingUserInput" | "session"
  >
): ThreadListV2Status {
  if (thread.hasPendingApprovals) return "approval";
  if (thread.hasPendingUserInput) return "input";
  if (thread.session?.status === "running" || thread.session?.status === "starting") {
    return "working";
  }
  if (thread.session?.status === "error") return "failed";
  return "ready";
}

function parseTimestampMs(isoDate: string): number {
  const parsed = Date.parse(isoDate);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function firstValidTimestampMs(...candidates: ReadonlyArray<string | null | undefined>): number {
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const parsed = Date.parse(candidate);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

/** Static creation order, newest first. Activity never reorders the list. */
export function sortThreadsForListV2<T extends { readonly id: string; readonly createdAt: string }>(
  threads: readonly T[]
): T[] {
  return [...threads].sort(
    (left, right) =>
      parseTimestampMs(right.createdAt) - parseTimestampMs(left.createdAt) ||
      left.id.localeCompare(right.id)
  );
}

export interface ThreadListV2Item {
  readonly thread: EnvironmentScopedThreadShell;
  readonly variant: "card" | "slim";
  /** First settled row after the card block draws the SETTLED divider. */
  readonly showSettledDivider: boolean;
  readonly isLast: boolean;
}

export interface ThreadListV2Layout {
  readonly items: ThreadListV2Item[];
  /** Settled threads beyond the render limit (behind "Show more"). */
  readonly hiddenSettledCount: number;
}

/**
 * Partitions visible threads into the active card block (creation order) and
 * the settled recency tail. `autoSettleAfterDays` defaults to 3 (web default).
 */
export function buildThreadListV2Items(input: {
  readonly threads: ReadonlyArray<EnvironmentScopedThreadShell>;
  readonly environmentId: EnvironmentId | null;
  readonly projectRef?: {
    readonly environmentId: EnvironmentId;
    readonly projectId: ProjectId;
  } | null;
  readonly searchQuery: string;
  /** Per-row PR state ("env:threadId" keys). */
  readonly changeRequestStateByKey?: ReadonlyMap<string, "open" | "closed" | "merged">;
  /**
   * Environments whose server supports thread.settle/unsettle. Threads on
   * other environments never classify as settled. Absent = no gating (tests).
   */
  readonly settlementEnvironmentIds?: ReadonlySet<EnvironmentId>;
  readonly autoSettleAfterDays?: number | null;
  readonly settledLimit?: number;
  readonly now?: string;
}): ThreadListV2Layout {
  const now = input.now ?? new Date().toISOString();
  const autoSettleAfterDays =
    input.autoSettleAfterDays === undefined ? 3 : input.autoSettleAfterDays;
  const query = input.searchQuery.trim().toLocaleLowerCase();

  const active: EnvironmentScopedThreadShell[] = [];
  const settled: EnvironmentScopedThreadShell[] = [];
  for (const thread of input.threads) {
    if (input.environmentId !== null && thread.environmentId !== input.environmentId) continue;
    if (
      input.projectRef != null &&
      (thread.environmentId !== input.projectRef.environmentId ||
        thread.projectId !== input.projectRef.projectId)
    ) {
      continue;
    }
    if (query.length > 0) {
      const matchesTitle = thread.title.toLocaleLowerCase().includes(query);
      const matchesBranch = thread.branch?.toLocaleLowerCase().includes(query) ?? false;
      if (!matchesTitle && !matchesBranch) continue;
    }
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
  const settledLimit = input.settledLimit ?? Number.POSITIVE_INFINITY;
  const visibleSettled =
    orderedSettled.length > settledLimit ? orderedSettled.slice(0, settledLimit) : orderedSettled;

  const items: ThreadListV2Item[] = [];
  for (const thread of orderedActive) {
    items.push({ thread, variant: "card", showSettledDivider: false, isLast: false });
  }
  for (const [index, thread] of visibleSettled.entries()) {
    items.push({
      thread,
      variant: "slim",
      showSettledDivider: index === 0,
      isLast: false,
    });
  }
  const last = items.at(-1);
  if (last) {
    items[items.length - 1] = { ...last, isLast: true };
  }
  return { items, hiddenSettledCount: orderedSettled.length - visibleSettled.length };
}
