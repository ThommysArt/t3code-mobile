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
  threads.sort((left, right) =>
    (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt)
  );
  return { projects, threads };
}
