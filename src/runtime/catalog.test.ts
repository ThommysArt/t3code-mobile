import { EnvironmentId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { buildScopedCatalog } from "./catalog";

const environmentId = EnvironmentId.make("environment-1");
const projectId = ProjectId.make("project-1");
const instanceId = ProviderInstanceId.make("openai");

describe("buildScopedCatalog", () => {
  function makeThread(input: {
    readonly id: string;
    readonly title: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly latestUserMessageAt?: string | null;
  }) {
    return {
      id: ThreadId.make(input.id),
      projectId,
      title: input.title,
      modelSelection: { instanceId, model: "gpt-5" },
      runtimeMode: "full-access" as const,
      interactionMode: "default" as const,
      branch: "main",
      worktreePath: "/workspace/t3code",
      latestTurn: null,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      archivedAt: null,
      session: null,
      latestUserMessageAt: input.latestUserMessageAt ?? null,
      hasPendingApprovals: false,
      hasPendingUserInput: false,
      hasActionableProposedPlan: false,
    };
  }

  it("publishes active WebSocket shell threads and excludes archived threads", () => {
    const catalog = buildScopedCatalog([
      {
        environmentId,
        snapshot: {
          snapshotSequence: 12,
          updatedAt: "2026-06-12T00:00:00.000Z",
          projects: [
            {
              id: projectId,
              title: "T3 Code",
              workspaceRoot: "/workspace/t3code",
              repositoryIdentity: null,
              defaultModelSelection: { instanceId, model: "gpt-5" },
              scripts: [],
              createdAt: "2026-06-10T00:00:00.000Z",
              updatedAt: "2026-06-12T00:00:00.000Z",
            },
          ],
          threads: [
            {
              id: ThreadId.make("active-thread"),
              projectId,
              title: "Active thread",
              modelSelection: { instanceId, model: "gpt-5" },
              runtimeMode: "full-access",
              interactionMode: "default",
              branch: "main",
              worktreePath: "/workspace/t3code",
              latestTurn: null,
              createdAt: "2026-06-11T00:00:00.000Z",
              updatedAt: "2026-06-12T00:00:00.000Z",
              archivedAt: null,
              session: null,
              latestUserMessageAt: null,
              hasPendingApprovals: false,
              hasPendingUserInput: false,
              hasActionableProposedPlan: false,
            },
            {
              id: ThreadId.make("archived-thread"),
              projectId,
              title: "Archived thread",
              modelSelection: { instanceId, model: "gpt-5" },
              runtimeMode: "full-access",
              interactionMode: "default",
              branch: "old",
              worktreePath: "/workspace/t3code",
              latestTurn: null,
              createdAt: "2026-06-10T00:00:00.000Z",
              updatedAt: "2026-06-10T00:00:00.000Z",
              archivedAt: "2026-06-11T00:00:00.000Z",
              session: null,
              latestUserMessageAt: null,
              hasPendingApprovals: false,
              hasPendingUserInput: false,
              hasActionableProposedPlan: false,
            },
          ],
        },
      },
    ]);

    expect(catalog.projects).toHaveLength(1);
    expect(catalog.threads.map((thread) => thread.title)).toEqual(["Active thread"]);
    expect(catalog.threads[0]?.environmentId).toBe(environmentId);
  });

  it("orders threads by latest user initiation instead of server updates", () => {
    const catalog = buildScopedCatalog([
      {
        environmentId,
        snapshot: {
          snapshotSequence: 13,
          updatedAt: "2026-06-12T00:10:00.000Z",
          projects: [],
          threads: [
            makeThread({
              id: "older-running-thread",
              title: "Older running thread",
              createdAt: "2026-06-10T00:00:00.000Z",
              latestUserMessageAt: "2026-06-10T00:00:00.000Z",
              updatedAt: "2026-06-12T00:10:00.000Z",
            }),
            makeThread({
              id: "newer-initiated-thread",
              title: "Newer initiated thread",
              createdAt: "2026-06-11T00:00:00.000Z",
              latestUserMessageAt: "2026-06-11T00:00:00.000Z",
              updatedAt: "2026-06-11T00:00:00.000Z",
            }),
          ],
        },
      },
    ]);

    expect(catalog.threads.map((thread) => thread.title)).toEqual([
      "Newer initiated thread",
      "Older running thread",
    ]);
  });
});
