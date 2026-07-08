import {
  scopeProjectShell,
  scopeThreadShell,
  type EnvironmentScopedProjectShell,
  type EnvironmentScopedThreadShell,
} from "@t3tools/client-runtime";
import type { EnvironmentId, OrchestrationShellSnapshot } from "@t3tools/contracts";

export interface CatalogEnvironment {
  readonly environmentId: EnvironmentId;
  readonly snapshot: OrchestrationShellSnapshot | null;
}

export interface ScopedCatalog {
  readonly projects: readonly EnvironmentScopedProjectShell[];
  readonly threads: readonly EnvironmentScopedThreadShell[];
}

export interface ThreadInitiatedAtInput {
  readonly createdAt: string;
  readonly latestUserMessageAt?: string | null;
}

export function getThreadInitiatedAt(thread: ThreadInitiatedAtInput): string {
  return thread.latestUserMessageAt ?? thread.createdAt;
}

export function compareThreadsByInitiatedAt<
  T extends { readonly id: string } & ThreadInitiatedAtInput,
>(left: T, right: T): number {
  const dateOrder = getThreadInitiatedAt(right).localeCompare(getThreadInitiatedAt(left));
  return dateOrder === 0 ? right.id.localeCompare(left.id) : dateOrder;
}

export function buildScopedCatalog(environments: readonly CatalogEnvironment[]): ScopedCatalog {
  const projects: EnvironmentScopedProjectShell[] = [];
  const threads: EnvironmentScopedThreadShell[] = [];

  for (const environment of environments) {
    for (const project of environment.snapshot?.projects ?? []) {
      projects.push(scopeProjectShell(environment.environmentId, project));
    }
    for (const thread of environment.snapshot?.threads ?? []) {
      if (thread.archivedAt === null) {
        threads.push(scopeThreadShell(environment.environmentId, thread));
      }
    }
  }

  projects.sort((left, right) => left.title.localeCompare(right.title));
  threads.sort(compareThreadsByInitiatedAt);
  return { projects, threads };
}
