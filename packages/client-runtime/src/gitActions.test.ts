import type { VcsStatusResult } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import {
  actionIncludesPendingCommit,
  requiresDefaultBranchConfirmation,
  resolveDefaultBranchActionDialogCopy,
  threadHasCommits,
} from "./gitActions.ts";

function status(overrides: Partial<VcsStatusResult> = {}): VcsStatusResult {
  return {
    isRepo: true,
    hasPrimaryRemote: true,
    isDefaultRef: true,
    refName: "main",
    hasWorkingTreeChanges: true,
    workingTree: { files: [], insertions: 0, deletions: 0 },
    hasUpstream: true,
    aheadCount: 0,
    behindCount: 0,
    pr: null,
    ...overrides,
  };
}

describe("threadHasCommits", () => {
  it("returns false when the thread has no commits ahead of default", () => {
    expect(threadHasCommits(status({ aheadCount: 0, aheadOfDefaultCount: 0 }))).toBe(false);
  });

  it("uses aheadOfDefaultCount when available", () => {
    expect(threadHasCommits(status({ aheadCount: 0, aheadOfDefaultCount: 1 }))).toBe(true);
  });
});

describe("requiresDefaultBranchConfirmation", () => {
  it("requires confirmation for first commit actions on the default ref", () => {
    expect(requiresDefaultBranchConfirmation("commit_push", true, status())).toBe(true);
  });

  it("skips confirmation once the thread already has commits", () => {
    expect(
      requiresDefaultBranchConfirmation("commit_push", true, status({ aheadOfDefaultCount: 1 }))
    ).toBe(false);
  });

  it("skips confirmation on non-default refs", () => {
    expect(requiresDefaultBranchConfirmation("commit_push", false, status())).toBe(false);
  });

  it("never asks before push once the branch is already chosen", () => {
    expect(requiresDefaultBranchConfirmation("push", true, status())).toBe(false);
    expect(
      requiresDefaultBranchConfirmation("push", true, status({ aheadOfDefaultCount: 1 }))
    ).toBe(false);
  });
});

describe("resolveDefaultBranchActionDialogCopy", () => {
  it("includes all three action labels for commit and push flows", () => {
    const copy = resolveDefaultBranchActionDialogCopy({
      action: "commit_push",
      branchName: "main",
      includesCommit: true,
    });

    expect(copy).toEqual({
      title: "Commit & push to default ref?",
      description:
        'This action will commit and push changes on "main". You can continue on this ref or create a feature ref and run the same action there.',
      continueLabel: "Commit & push to main",
      featureBranchLabel: "Checkout feature branch & continue",
    });
  });
});

describe("actionIncludesPendingCommit", () => {
  it("treats commit_push as pending only when there are working tree changes", () => {
    expect(
      actionIncludesPendingCommit({
        action: "commit_push",
        hasWorkingTreeChanges: true,
      })
    ).toBe(true);
    expect(
      actionIncludesPendingCommit({
        action: "commit_push",
        hasWorkingTreeChanges: false,
      })
    ).toBe(false);
  });

  it("treats commit_push as pending when a custom commit message is provided", () => {
    expect(
      actionIncludesPendingCommit({
        action: "commit_push",
        hasWorkingTreeChanges: false,
        commitMessage: "Fix git confirmation toast",
      })
    ).toBe(true);
  });
});