import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  MessageId,
  type ModelSelection,
  type ProjectId,
  type ThreadId,
  type ThreadTurnStartBootstrap,
  type UploadChatAttachment,
} from "@t3tools/contracts";
import { buildTemporaryWorktreeBranchName } from "@t3tools/shared/git";

export type NewThreadEnvMode = "local" | "worktree";

export function buildNewThreadTurnStartBootstrap(input: {
  readonly projectId: ProjectId;
  readonly projectCwd: string;
  readonly title: string;
  readonly modelSelection: ModelSelection;
  readonly branch: string | null;
  readonly envMode: NewThreadEnvMode;
  readonly createdAt: string;
  readonly randomHex: (byteLength: number) => string;
}): ThreadTurnStartBootstrap {
  const bootstrap: ThreadTurnStartBootstrap = {
    createThread: {
      projectId: input.projectId,
      title: input.title,
      modelSelection: input.modelSelection,
      runtimeMode: DEFAULT_RUNTIME_MODE,
      interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
      branch: input.branch,
      worktreePath: null,
      createdAt: input.createdAt,
    },
  };

  if (input.envMode !== "worktree" || !input.branch) {
    return bootstrap;
  }

  return {
    ...bootstrap,
    prepareWorktree: {
      projectCwd: input.projectCwd,
      baseBranch: input.branch,
      branch: buildTemporaryWorktreeBranchName(input.randomHex),
      startFromOrigin: true,
    },
    runSetupScript: true,
  };
}

export function validateNewThreadSubmit(input: {
  readonly envMode: NewThreadEnvMode;
  readonly branch: string | null;
}): string | null {
  if (input.envMode === "worktree" && !input.branch?.trim()) {
    return "Select a base branch before creating a thread in New worktree mode.";
  }
  return null;
}

export function buildNewThreadTurnStartCommand(input: {
  readonly commandId: CommandId;
  readonly threadId: ThreadId;
  readonly messageId: MessageId;
  readonly projectId: ProjectId;
  readonly projectCwd: string;
  readonly title: string;
  readonly prompt: string;
  readonly attachments?: readonly UploadChatAttachment[];
  readonly modelSelection: ModelSelection;
  readonly branch: string | null;
  readonly envMode: NewThreadEnvMode;
  readonly createdAt: string;
  readonly randomHex: (byteLength: number) => string;
}) {
  return {
    type: "thread.turn.start" as const,
    commandId: input.commandId,
    threadId: input.threadId,
    message: {
      messageId: input.messageId,
      role: "user" as const,
      text: input.prompt.trim(),
      attachments: input.attachments ?? [],
    },
    modelSelection: input.modelSelection,
    titleSeed: input.title,
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
    bootstrap: buildNewThreadTurnStartBootstrap({
      projectId: input.projectId,
      projectCwd: input.projectCwd,
      title: input.title,
      modelSelection: input.modelSelection,
      branch: input.branch,
      envMode: input.envMode,
      createdAt: input.createdAt,
      randomHex: input.randomHex,
    }),
    createdAt: input.createdAt,
  };
}
