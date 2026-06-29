import { useAtomValue } from "@effect/atom-react";
import {
  checkpointDiffStateAtom,
  createCheckpointDiffManager,
  EMPTY_CHECKPOINT_DIFF_ATOM,
  EMPTY_CHECKPOINT_DIFF_STATE,
  getCheckpointDiffTargetKey,
  type CheckpointDiffClient,
  type CheckpointDiffState,
  type CheckpointDiffTarget,
} from "@t3tools/client-runtime";
import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useMemo } from "react";

import { appAtomRegistry } from "./atom-registry";
import { useEnvironments } from "./EnvironmentProvider";

let resolveCheckpointDiffClient: (environmentId: EnvironmentId) => CheckpointDiffClient | null =
  () => null;

export const checkpointDiffManager = createCheckpointDiffManager({
  getRegistry: () => appAtomRegistry,
  getClient: (environmentId) => resolveCheckpointDiffClient(environmentId),
});

export function useCheckpointDiff(
  target: CheckpointDiffTarget,
  options?: { readonly enabled?: boolean }
): CheckpointDiffState {
  const { getClient } = useEnvironments();
  const stableTarget = useMemo(
    () => ({
      environmentId: target.environmentId,
      threadId: target.threadId,
      fromTurnCount: target.fromTurnCount,
      toTurnCount: target.toTurnCount,
      ignoreWhitespace: target.ignoreWhitespace,
      cacheScope: target.cacheScope ?? null,
    }),
    [
      target.cacheScope,
      target.environmentId,
      target.fromTurnCount,
      target.ignoreWhitespace,
      target.threadId,
      target.toTurnCount,
    ]
  );
  const targetKey = getCheckpointDiffTargetKey(stableTarget);

  useEffect(() => {
    resolveCheckpointDiffClient = (id) => getClient(id)?.orchestration ?? null;
    if (targetKey === null || options?.enabled === false) {
      return;
    }
    void checkpointDiffManager.load(stableTarget);
  }, [getClient, options?.enabled, stableTarget, targetKey]);

  const state = useAtomValue(
    targetKey !== null ? checkpointDiffStateAtom(targetKey) : EMPTY_CHECKPOINT_DIFF_ATOM
  );
  return targetKey === null || options?.enabled === false ? EMPTY_CHECKPOINT_DIFF_STATE : state;
}