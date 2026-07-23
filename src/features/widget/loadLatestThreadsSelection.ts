import type { EnvironmentScopedThreadShell } from "@t3tools/client-runtime";
import type { EnvironmentId } from "@t3tools/contracts";

import { buildScopedCatalog } from "../../runtime/catalog";
import { loadAllCachedShellSnapshots } from "../../runtime/db";
import { getPreferences, loadPreferences } from "../../runtime/preferences";

import {
  selectLatestThreadsForWidget,
  type LatestThreadsWidgetSelection,
} from "./latestThreads";

/**
 * Load the latest-threads widget payload from the local shell cache.
 * Widget handlers run headless, so this must not depend on React providers.
 */
export async function loadLatestThreadsSelection(input?: {
  readonly threads?: ReadonlyArray<EnvironmentScopedThreadShell>;
  readonly projectTitleByKey?: ReadonlyMap<string, string>;
  readonly settlementEnvironmentIds?: ReadonlySet<EnvironmentId>;
  readonly autoSettleAfterDays?: number | null;
  readonly now?: string;
}): Promise<LatestThreadsWidgetSelection> {
  await loadPreferences().catch(() => getPreferences());
  const preferences = getPreferences();

  if (input?.threads) {
    return selectLatestThreadsForWidget({
      threads: input.threads,
      projectTitleByKey: input.projectTitleByKey,
      settlementEnvironmentIds: input.settlementEnvironmentIds,
      autoSettleAfterDays: input.autoSettleAfterDays ?? preferences.autoSettleAfterDays,
      now: input.now,
    });
  }

  const cached = await loadAllCachedShellSnapshots();
  const catalog = buildScopedCatalog(
    cached.map((entry) => ({
      environmentId: entry.environmentId,
      snapshot: entry.snapshot,
    }))
  );

  const projectTitleByKey = new Map<string, string>();
  for (const project of catalog.projects) {
    projectTitleByKey.set(`${project.environmentId}:${project.id}`, project.title);
  }

  return selectLatestThreadsForWidget({
    threads: catalog.threads,
    projectTitleByKey,
    autoSettleAfterDays: preferences.autoSettleAfterDays,
    now: input?.now,
  });
}
