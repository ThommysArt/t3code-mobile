import type {
  OrchestrationReadModel,
  OrchestrationShellSnapshot,
  OrchestrationThread,
  OrchestrationThreadShell,
} from "@t3tools/contracts";

export function toShellThread(thread: OrchestrationThread): OrchestrationThreadShell {
  return {
    id: thread.id,
    projectId: thread.projectId,
    title: thread.title,
    modelSelection: thread.modelSelection,
    runtimeMode: thread.runtimeMode,
    interactionMode: thread.interactionMode,
    branch: thread.branch,
    worktreePath: thread.worktreePath,
    latestTurn: thread.latestTurn,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    archivedAt: thread.archivedAt,
    session: thread.session,
    latestUserMessageAt:
      [...thread.messages].reverse().find((message) => message.role === "user")?.createdAt ?? null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  };
}

export function toShellSnapshot(readModel: OrchestrationReadModel): OrchestrationShellSnapshot {
  return {
    snapshotSequence: readModel.snapshotSequence,
    projects: readModel.projects.map((project) => ({
      id: project.id,
      title: project.title,
      workspaceRoot: project.workspaceRoot,
      repositoryIdentity: project.repositoryIdentity ?? null,
      defaultModelSelection: project.defaultModelSelection,
      scripts: project.scripts,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    })),
    threads: readModel.threads.map(toShellThread),
    updatedAt: readModel.updatedAt,
  };
}

export function countActiveThreads(snapshot: OrchestrationShellSnapshot): number {
  return snapshot.threads.filter((thread) => thread.archivedAt == null).length;
}