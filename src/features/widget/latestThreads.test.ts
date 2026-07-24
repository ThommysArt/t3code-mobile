import type { EnvironmentScopedThreadShell } from "@t3tools/client-runtime";
import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import {
  LATEST_THREADS_WIDGET_LIMIT,
  formatWidgetRelativeTime,
  selectLatestThreadsForWidget,
  threadWidgetDeepLink,
} from "./latestThreads";

const environmentId = EnvironmentId.make("environment-1");

function makeThread(
  input: Partial<EnvironmentScopedThreadShell> & Pick<EnvironmentScopedThreadShell, "id" | "title">
): EnvironmentScopedThreadShell {
  return {
    environmentId,
    projectId: ProjectId.make("project-1"),
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

const NOW = "2026-06-02T00:00:00.000Z";

describe("selectLatestThreadsForWidget", () => {
  it("shows only unsettled threads when there are at least 5", () => {
    const threads = Array.from({ length: 6 }, (_, index) =>
      makeThread({
        id: ThreadId.make(`active-${index}`),
        title: `Active ${index}`,
        createdAt: `2026-06-01T0${index}:00:00.000Z`,
      })
    ).concat(
      makeThread({
        id: ThreadId.make("settled"),
        title: "Settled",
        settledOverride: "settled",
        settledAt: NOW,
        latestUserMessageAt: "2026-06-01T20:00:00.000Z",
      })
    );

    const selection = selectLatestThreadsForWidget({ threads, now: NOW });
    expect(selection.items).toHaveLength(LATEST_THREADS_WIDGET_LIMIT);
    expect(selection.items.every((item) => item.variant === "active")).toBe(true);
    expect(selection.items.map((item) => item.thread.id)).toEqual([
      "active-5",
      "active-4",
      "active-3",
      "active-2",
      "active-1",
    ]);
    expect(selection.activeCount).toBe(6);
    expect(selection.settledCount).toBe(1);
  });

  it("fills with settled threads when unsettled are fewer than 5", () => {
    const threads = [
      makeThread({
        id: ThreadId.make("active-a"),
        title: "Active A",
        createdAt: "2026-06-01T12:00:00.000Z",
      }),
      makeThread({
        id: ThreadId.make("active-b"),
        title: "Active B",
        createdAt: "2026-06-01T10:00:00.000Z",
      }),
      makeThread({
        id: ThreadId.make("settled-old"),
        title: "Settled old",
        settledOverride: "settled",
        settledAt: NOW,
        latestUserMessageAt: "2026-06-01T08:00:00.000Z",
      }),
      makeThread({
        id: ThreadId.make("settled-new"),
        title: "Settled new",
        settledOverride: "settled",
        settledAt: NOW,
        latestUserMessageAt: "2026-06-01T18:00:00.000Z",
      }),
      makeThread({
        id: ThreadId.make("settled-mid"),
        title: "Settled mid",
        settledOverride: "settled",
        settledAt: NOW,
        latestUserMessageAt: "2026-06-01T12:00:00.000Z",
      }),
      makeThread({
        id: ThreadId.make("settled-extra"),
        title: "Settled extra",
        settledOverride: "settled",
        settledAt: NOW,
        latestUserMessageAt: "2026-06-01T06:00:00.000Z",
      }),
    ];

    const selection = selectLatestThreadsForWidget({ threads, now: NOW });
    expect(selection.items).toHaveLength(5);
    expect(selection.items.map((item) => `${item.variant}:${item.thread.id}`)).toEqual([
      "active:active-a",
      "active:active-b",
      "settled:settled-new",
      "settled:settled-mid",
      "settled:settled-old",
    ]);
  });

  it("shows fewer than 5 when there are not enough threads", () => {
    const selection = selectLatestThreadsForWidget({
      threads: [
        makeThread({ id: ThreadId.make("only"), title: "Only" }),
        makeThread({
          id: ThreadId.make("done"),
          title: "Done",
          settledOverride: "settled",
          settledAt: NOW,
        }),
      ],
      now: NOW,
    });
    expect(selection.items).toHaveLength(2);
    expect(selection.items[0]?.variant).toBe("active");
    expect(selection.items[1]?.variant).toBe("settled");
  });

  it("never classifies threads on non-settlement environments as settled", () => {
    const selection = selectLatestThreadsForWidget({
      threads: [
        makeThread({
          id: ThreadId.make("legacy"),
          title: "Legacy",
          settledOverride: "settled",
          settledAt: NOW,
        }),
      ],
      settlementEnvironmentIds: new Set(),
      now: NOW,
    });
    expect(selection.items).toHaveLength(1);
    expect(selection.items[0]?.variant).toBe("active");
  });

  it("attaches project titles when provided", () => {
    const selection = selectLatestThreadsForWidget({
      threads: [makeThread({ id: ThreadId.make("t"), title: "T" })],
      projectTitleByKey: new Map([[`${environmentId}:project-1`, "My Project"]]),
      now: NOW,
    });
    expect(selection.items[0]?.projectTitle).toBe("My Project");
  });
});

describe("threadWidgetDeepLink", () => {
  it("builds a t3code-mobile deep link", () => {
    expect(threadWidgetDeepLink("env/1", "thread/2")).toBe(
      "t3code-mobile://threads/env%2F1/thread%2F2"
    );
  });
});

describe("formatWidgetRelativeTime", () => {
  it("formats short elapsed intervals", () => {
    const now = Date.parse("2026-06-02T00:00:00.000Z");
    expect(formatWidgetRelativeTime("2026-06-01T23:59:30.000Z", now)).toBe("30s");
    expect(formatWidgetRelativeTime("2026-06-01T23:50:00.000Z", now)).toBe("10m");
    expect(formatWidgetRelativeTime("2026-06-01T20:00:00.000Z", now)).toBe("4h");
    expect(formatWidgetRelativeTime("2026-05-31T00:00:00.000Z", now)).toBe("2d");
  });
});
