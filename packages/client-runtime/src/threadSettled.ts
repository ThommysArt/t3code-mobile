import type { OrchestrationThreadShell } from "@t3tools/contracts";

export type ChangeRequestStateLike = "open" | "closed" | "merged";

const DAY_MS = 24 * 60 * 60 * 1_000;

export function threadLastActivityAt(shell: OrchestrationThreadShell): string | null {
  const candidates = [
    shell.latestUserMessageAt,
    shell.latestTurn?.requestedAt,
    shell.latestTurn?.startedAt,
    shell.latestTurn?.completedAt,
  ];
  let latest: string | null = null;
  let latestTimestamp = Number.NEGATIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue;
    const timestamp = Date.parse(candidate);
    if (timestamp > latestTimestamp) {
      latest = candidate;
      latestTimestamp = timestamp;
    }
  }

  return latest;
}

/**
 * A queued turn start lives for at most this long: session adoption takes
 * seconds, so a user message still unadopted after the grace window is a
 * failed start (or stale data), not pending work.
 */
export const QUEUED_TURN_START_GRACE_MS = 2 * 60 * 1_000;

/**
 * A user message no turn has picked up yet: the turn.start command was
 * dispatched but no session has adopted it, so `session` is still null and
 * the pending work is invisible to session-status checks.
 */
export function hasQueuedTurnStart(
  shell: Pick<OrchestrationThreadShell, "latestUserMessageAt" | "latestTurn" | "session">,
  options: { readonly now: string }
): boolean {
  if (shell.latestUserMessageAt == null) return false;
  if (shell.session?.status === "error") return false;
  const messageAt = Date.parse(shell.latestUserMessageAt);
  if (Number.isNaN(messageAt)) return false;
  const nowMs = Date.parse(options.now);
  if (Number.isNaN(nowMs)) return false;
  if (Math.abs(nowMs - messageAt) > QUEUED_TURN_START_GRACE_MS) return false;
  const turn = shell.latestTurn;
  if (turn === null) return true;
  return [turn.requestedAt, turn.startedAt, turn.completedAt].every(
    (candidate) => candidate == null || Date.parse(candidate) < messageAt
  );
}

/**
 * A thread may be settled only when none of effectiveSettled's activity
 * blockers hold. Client-side twin of the server decider so the UI can
 * disable/reject before a round trip.
 */
export function canSettle(
  shell: Pick<
    OrchestrationThreadShell,
    "hasPendingApprovals" | "hasPendingUserInput" | "session" | "latestUserMessageAt" | "latestTurn"
  >,
  options: { readonly now: string }
): boolean {
  if (shell.hasPendingApprovals || shell.hasPendingUserInput) return false;
  if (shell.session?.status === "starting" || shell.session?.status === "running") return false;
  if (hasQueuedTurnStart(shell, options)) return false;
  return true;
}

/**
 * Settled resolution over the server-backed settled lifecycle. The explicit
 * user override (thread.settle / thread.unsettle) wins in both directions;
 * without one, a thread auto-settles on a merged/closed PR or inactivity
 * past the window.
 */
export function effectiveSettled(
  shell: OrchestrationThreadShell,
  options: {
    readonly now: string;
    readonly autoSettleAfterDays: number | null;
    readonly changeRequestState?: ChangeRequestStateLike | null;
  }
): boolean {
  if (shell.hasPendingApprovals || shell.hasPendingUserInput) return false;
  if (shell.session?.status === "starting" || shell.session?.status === "running") return false;
  if (hasQueuedTurnStart(shell, { now: options.now })) {
    const serverAdjudicated =
      shell.settledOverride === "settled" &&
      shell.settledAt !== null &&
      shell.latestUserMessageAt !== null &&
      Date.parse(shell.settledAt) >= Date.parse(shell.latestUserMessageAt);
    if (!serverAdjudicated) return false;
  }
  if (shell.settledOverride === "settled") return true;
  // "active" is the explicit keep-active pin: suppresses auto-settle until
  // real activity clears it server-side.
  if (shell.settledOverride === "active") return false;
  if (options.changeRequestState === "merged" || options.changeRequestState === "closed") {
    return true;
  }
  if (options.autoSettleAfterDays === null) return false;

  const lastActivityAt = threadLastActivityAt(shell);
  if (lastActivityAt === null) return false;

  return (
    Date.parse(lastActivityAt) < Date.parse(options.now) - options.autoSettleAfterDays * DAY_MS
  );
}
