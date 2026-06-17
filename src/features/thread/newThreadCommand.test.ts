import { ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import {
  buildNewThreadTurnStartBootstrap,
  validateNewThreadSubmit,
} from "./newThreadCommand";

const modelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-5",
};

describe("buildNewThreadTurnStartBootstrap", () => {
  it("uses null worktreePath for local mode", () => {
    const bootstrap = buildNewThreadTurnStartBootstrap({
      projectId: "project-1" as never,
      projectCwd: "/workspace/app",
      title: "Fix tests",
      modelSelection,
      branch: "main",
      envMode: "local",
      createdAt: "2026-06-17T00:00:00.000Z",
      randomHex: () => "deadbeef",
    });

    expect(bootstrap.createThread?.worktreePath).toBeNull();
    expect(bootstrap.prepareWorktree).toBeUndefined();
    expect(bootstrap.runSetupScript).toBeUndefined();
  });

  it("includes prepareWorktree with a generated branch for worktree mode", () => {
    const bootstrap = buildNewThreadTurnStartBootstrap({
      projectId: "project-1" as never,
      projectCwd: "/workspace/app",
      title: "Fix tests",
      modelSelection,
      branch: "main",
      envMode: "worktree",
      createdAt: "2026-06-17T00:00:00.000Z",
      randomHex: () => "abcd1234",
    });

    expect(bootstrap.createThread?.worktreePath).toBeNull();
    expect(bootstrap.prepareWorktree).toEqual({
      projectCwd: "/workspace/app",
      baseBranch: "main",
      branch: "t3code/abcd1234",
    });
    expect(bootstrap.runSetupScript).toBe(true);
  });
});

describe("validateNewThreadSubmit", () => {
  it("requires a branch for worktree mode", () => {
    expect(validateNewThreadSubmit({ envMode: "worktree", branch: null })).toMatch(
      /base branch/i
    );
    expect(validateNewThreadSubmit({ envMode: "worktree", branch: "main" })).toBeNull();
    expect(validateNewThreadSubmit({ envMode: "local", branch: null })).toBeNull();
  });
});