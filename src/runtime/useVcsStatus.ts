import type { EnvironmentId, VcsStatusResult } from "@t3tools/contracts";
import { useCallback, useEffect, useState } from "react";

import { useEnvironments } from "./EnvironmentProvider";

interface VcsStatusState {
  readonly data: VcsStatusResult | null;
  readonly isPending: boolean;
  readonly error: string | null;
}

export function useVcsStatus(environmentId: EnvironmentId, cwd: string | null) {
  const { getClient, getEnvironment } = useEnvironments();
  const environment = getEnvironment(environmentId);
  const [state, setState] = useState<VcsStatusState>({
    data: null,
    isPending: Boolean(cwd),
    error: null,
  });

  const refresh = useCallback(async () => {
    const client = getClient(environmentId);
    if (!client || !cwd) return null;
    setState((current) => ({ ...current, isPending: true, error: null }));
    try {
      const status = await client.vcs.refreshStatus({ cwd });
      setState({ data: status, isPending: false, error: null });
      return status;
    } catch (error) {
      setState((current) => ({
        ...current,
        isPending: false,
        error: error instanceof Error ? error.message : "Unable to refresh Git status.",
      }));
      return null;
    }
  }, [cwd, environmentId, getClient]);

  useEffect(() => {
    const client = getClient(environmentId);
    if (!client || !cwd) {
      setState({ data: null, isPending: false, error: null });
      return;
    }

    setState((current) => ({ ...current, isPending: true, error: null }));
    const unsubscribe = client.vcs.onStatus(
      { cwd },
      (status) => setState({ data: status, isPending: false, error: null }),
      {
        onResubscribe: () => setState((current) => ({ ...current, isPending: true, error: null })),
      }
    );
    void refresh();
    return unsubscribe;
  }, [cwd, environment?.sessionRevision, environmentId, getClient, refresh]);

  return { ...state, refresh };
}
