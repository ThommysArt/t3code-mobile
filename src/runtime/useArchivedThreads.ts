import type { EnvironmentId, OrchestrationShellSnapshot } from "@t3tools/contracts";
import { useCallback, useEffect, useState } from "react";

import { useEnvironments } from "./EnvironmentProvider";
import { formatRemoteError } from "./statusLog";

export interface ArchivedSnapshotEntry {
  readonly environmentId: EnvironmentId;
  readonly snapshot: OrchestrationShellSnapshot;
}

export function useArchivedThreads(environmentIds: readonly EnvironmentId[]) {
  const { getClient } = useEnvironments();
  const [snapshots, setSnapshots] = useState<readonly ArchivedSnapshotEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (environmentIds.length === 0) {
      setSnapshots([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    try {
      const entries = await Promise.all(
        environmentIds.map(async (environmentId) => {
          const client = getClient(environmentId);
          if (!client) return null;
          const snapshot = await client.orchestration.getArchivedShellSnapshot();
          return { environmentId, snapshot };
        })
      );
      setSnapshots(entries.filter((entry): entry is ArchivedSnapshotEntry => entry !== null));
      setError(null);
    } catch (refreshError) {
      setSnapshots([]);
      setError(formatRemoteError(refreshError));
    } finally {
      setIsLoading(false);
    }
  }, [environmentIds, getClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    snapshots,
    isLoading,
    error,
    refresh,
  };
}