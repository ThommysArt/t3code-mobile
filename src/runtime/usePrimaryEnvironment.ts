import type { EnvironmentId } from "@t3tools/contracts";
import { useMemo, useState } from "react";

import { useEnvironments, type EnvironmentViewState } from "./EnvironmentProvider";

export function usePrimaryEnvironment() {
  const { environments } = useEnvironments();
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<EnvironmentId | null>(null);

  const readyEnvironments = useMemo(
    () => environments.filter((environment) => environment.connectionState === "ready"),
    [environments]
  );

  const primaryEnvironment = useMemo<EnvironmentViewState | null>(() => {
    if (selectedEnvironmentId) {
      const selected = environments.find(
        (environment) => environment.connection.environmentId === selectedEnvironmentId
      );
      if (selected) return selected;
    }
    return readyEnvironments[0] ?? environments[0] ?? null;
  }, [environments, readyEnvironments, selectedEnvironmentId]);

  return {
    primaryEnvironment,
    readyEnvironments,
    selectEnvironment: setSelectedEnvironmentId,
  };
}