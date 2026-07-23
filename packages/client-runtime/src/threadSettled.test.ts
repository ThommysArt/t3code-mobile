import {
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationThreadShell,
} from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { canSettle, effectiveSettled, hasQueuedTurnStart, threadLastActivityAt } from "./threadSettled";

const NOW = "2026-06-02T00:00:00.000Z";

function makeShell(
  input: Partial<OrchestrationThreadShell> = {}
): OrchestrationThreadShell {
  return {
    id: ThreadId.make("thread-1"),
    projectId: ProjectId.make("project-1"),
    title: "Thread",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    ...input,
  };
}

describe("threadLastActivityAt", () => {
  it("picks the newest activity timestamp", () => {
    const shell = makeShell({
      latestUserMessageAt: "2026-06-01T10:00:00.000Z",
      latestTurn: {
        turnId: TurnId.make("turn-1"),
        state: "completed",
        requestedAt: "2026-06-01T11:00:00.000Z",
        startedAt: "2026-06-01T11:00:01.000Z",
        completedAt: "2026-06-01T12:00:00.000Z",
        assistantMessageId: null,
      },
    });
    expect(threadLastActivityAt(shell)).toBe("2026-06-01T12:00:00.000Z");
  });
});

describe("hasQueuedTurnStart", () => {
  it("detects a user message with no adopted turn inside the grace window", () => {
    expect(
      hasQueuedTurnStart(
        makeShell({ latestUserMessageAt: "2026-06-01T23:59:00.000Z" }),
        { now: NOW }
      )
    ).toBe(true);
  });

  it("returns false outside the grace window", () => {
    expect(
      hasQueuedTurnStart(
        makeShell({ latestUserMessageAt: "2026-06-01T00:00:00.000Z" }),
        { now: NOW }
      )
    ).toBe(false);
  });
});

describe("canSettle", () => {
  it("blocks running sessions and pending approvals", () => {
    expect(
      canSettle(
        makeShell({
          session: {
            threadId: ThreadId.make("thread-1"),
            status: "running",
            providerName: "Codex",
            providerInstanceId: ProviderInstanceId.make("codex"),
            runtimeMode: "full-access",
            activeTurnId: TurnId.make("turn-1"),
            lastError: null,
            updatedAt: NOW,
          },
        }),
        { now: NOW }
      )
    ).toBe(false);

    expect(canSettle(makeShell({ hasPendingApprovals: true }), { now: NOW })).toBe(false);
  });

  it("allows idle threads", () => {
    expect(canSettle(makeShell(), { now: NOW })).toBe(true);
  });
});

describe("effectiveSettled", () => {
  it("honors explicit settled override", () => {
    expect(
      effectiveSettled(
        makeShell({ settledOverride: "settled", settledAt: NOW }),
        { now: NOW, autoSettleAfterDays: 3 }
      )
    ).toBe(true);
  });

  it("keeps explicit active pin out of the settled tail", () => {
    expect(
      effectiveSettled(
        makeShell({
          settledOverride: "active",
          latestUserMessageAt: "2026-05-01T00:00:00.000Z",
        }),
        { now: NOW, autoSettleAfterDays: 3 }
      )
    ).toBe(false);
  });

  it("auto-settles inactive threads past the window", () => {
    expect(
      effectiveSettled(
        makeShell({ latestUserMessageAt: "2026-05-20T00:00:00.000Z" }),
        { now: NOW, autoSettleAfterDays: 3 }
      )
    ).toBe(true);
  });

  it("auto-settles merged change requests", () => {
    expect(
      effectiveSettled(
        makeShell({
          // Outside the queued-turn grace window so PR state alone settles.
          latestUserMessageAt: "2026-06-01T12:00:00.000Z",
        }),
        {
          now: NOW,
          autoSettleAfterDays: null,
          changeRequestState: "merged",
        }
      )
    ).toBe(true);
  });

  it("never settles blocked work even with a settle override", () => {
    expect(
      effectiveSettled(
        makeShell({
          settledOverride: "settled",
          settledAt: NOW,
          hasPendingUserInput: true,
        }),
        { now: NOW, autoSettleAfterDays: 3 }
      )
    ).toBe(false);
  });
});
