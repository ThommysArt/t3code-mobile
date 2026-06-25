import type { EnvironmentId, ServerSettings, ServerSettingsPatch } from "@t3tools/contracts";
import { applyServerSettingsPatch } from "@t3tools/shared/serverSettings";
import { useCallback, useEffect, useState } from "react";

import { useEnvironments } from "./EnvironmentProvider";
import { formatRemoteError } from "./statusLog";

export function useServerSettings(environmentId: EnvironmentId | null | undefined) {
  const { getClient, getEnvironment } = useEnvironments();
  const [settings, setSettings] = useState<ServerSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const environment = environmentId ? getEnvironment(environmentId) : null;
  const sessionRevision = environment?.sessionRevision ?? 0;
  const isLive = Boolean(
    environmentId && environment?.connectionState === "ready" && getClient(environmentId)
  );

  const refresh = useCallback(async () => {
    if (!environmentId) {
      setSettings(null);
      setError(null);
      return;
    }

    const client = getClient(environmentId);
    if (!client) {
      setError("Live connection required to load server settings.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const next = await client.server.getSettings();
      setSettings(next);
      setError(null);
    } catch (refreshError) {
      setError(formatRemoteError(refreshError));
    } finally {
      setIsLoading(false);
    }
  }, [environmentId, getClient, sessionRevision]);

  const updateSettings = useCallback(
    async (patch: ServerSettingsPatch) => {
      if (!environmentId) {
        throw new Error("No server selected.");
      }
      const client = getClient(environmentId);
      if (!client) {
        throw new Error("Live connection required to update server settings.");
      }
      if (!settings) {
        throw new Error("Server settings are not loaded yet.");
      }

      const previous = settings;
      setSettings(applyServerSettingsPatch(settings, patch));
      try {
        const next = await client.server.updateSettings(patch);
        setSettings(next);
        setError(null);
      } catch (updateError) {
        setSettings(previous);
        throw updateError;
      }
    },
    [environmentId, getClient, settings]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    settings,
    isLoading,
    error,
    isLive,
    refresh,
    updateSettings,
  };
}
