import { describe, expect, it } from "vitest";

import { toShellSnapshot } from "./shellSnapshot";

describe("HTTP shell snapshot conversion", () => {
  it("keeps thread routing and activity metadata", () => {
    const readModel = {
      snapshotSequence: 17,
      updatedAt: "2026-06-11T12:00:00.000Z",
      projects: [
        {
          id: "project-1",
          title: "T3 Code",
          workspaceRoot: "/work/t3code",
          repositoryIdentity: null,
          defaultModelSelection: null,
          scripts: [],
          createdAt: "2026-06-10T12:00:00.000Z",
          updatedAt: "2026-06-11T12:00:00.000Z",
        },
      ],
      threads: [
        {
          id: "thread-1",
          projectId: "project-1",
          title: "Repair mobile sync",
          modelSelection: { instanceId: "codex", model: "gpt-5.4" },
          runtimeMode: "full-access",
          interactionMode: "default",
          branch: "fix/mobile-sync",
          worktreePath: "/work/t3code",
          latestTurn: null,
          createdAt: "2026-06-10T12:00:00.000Z",
          updatedAt: "2026-06-11T12:00:00.000Z",
          archivedAt: null,
          settledOverride: null,
          settledAt: null,
          deletedAt: null,
          messages: [
            {
              id: "message-1",
              role: "user",
              text: "Fix sync",
              attachments: [],
              turnId: null,
              streaming: false,
              createdAt: "2026-06-11T11:59:00.000Z",
              updatedAt: "2026-06-11T11:59:00.000Z",
            },
          ],
          proposedPlans: [],
          activities: [],
          checkpoints: [],
          session: null,
        },
      ],
    };

    const shell = toShellSnapshot(readModel as never);
    expect(shell.snapshotSequence).toBe(17);
    expect(shell.projects[0]?.workspaceRoot).toBe("/work/t3code");
    expect(shell.threads[0]).toMatchObject({
      id: "thread-1",
      projectId: "project-1",
      branch: "fix/mobile-sync",
      latestUserMessageAt: "2026-06-11T11:59:00.000Z",
    });
  });
});
