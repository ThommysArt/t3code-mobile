import type { DiscoveredLocalServer, DiscoveredLocalServerList, EnvironmentId } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { useEnvironments } from "./EnvironmentProvider";

export interface DiscoveredLocalServersState {
  readonly servers: ReadonlyArray<DiscoveredLocalServer>;
  readonly scannedAt: string | null;
  readonly error: string | null;
}

const EMPTY_STATE: DiscoveredLocalServersState = {
  servers: [],
  scannedAt: null,
  error: null,
};

export function useDiscoveredLocalServers(
  environmentId: EnvironmentId,
  live: boolean
): DiscoveredLocalServersState {
  const { getClient } = useEnvironments();
  const [state, setState] = useState<DiscoveredLocalServersState>(EMPTY_STATE);

  useEffect(() => {
    if (!live) {
      setState(EMPTY_STATE);
      return;
    }

    const client = getClient(environmentId);
    if (!client) {
      setState(EMPTY_STATE);
      return;
    }

    return client.preview.onDiscoveredLocalServers(
      (list: DiscoveredLocalServerList) => {
        setState({
          servers: list.servers,
          scannedAt: list.scannedAt,
          error: null,
        });
      },
      {
        onResubscribe: () => {
          setState(EMPTY_STATE);
        },
      }
    );
  }, [environmentId, getClient, live]);

  return state;
}