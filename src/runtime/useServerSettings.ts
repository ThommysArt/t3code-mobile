import type { EnvironmentId, ServerSettings, ServerSettingsPatch } from "@t3tools/contracts";
import { applyServerSettingsPatch } from "@t3tools/shared/serverSettings";
import { useCallback, useEffect, useState } from "react";

import { useEnvironments } from "./EnvironmentProvider";
import { formatRemoteError } from "./statusLog";

export function useServerSettings(environmentId: EnvironmentId | null | undefined) {
  const { getClient, getEnvironment } = useEnvironments();
  const environment = environmentId ? getEnvironment(environmentId) : null;
  const serverConfigSettings = environment?.serverConfig?.settings ?? null;
  const [settings, setSettings] = useState<ServerSettings | null>(serverConfigSettings);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      if (environment?.connectionState === "disconnected") {
        setError("Live connection required to load server settings.");
      } else {
        setError(null);
      }
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
  }, [environment?.connectionState, environmentId, getClient]);

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
    setSettings(serverConfigSettings);
  }, [environmentId, serverConfigSettings]);

  useEffect(() => {
    let active = true;
    async function refreshIfActive() {
      if (!environmentId) {
        if (!active) return;
        setSettings(null);
        setError(null);
        setIsLoading(false);
        return;
      }

      const client = getClient(environmentId);
      if (!client) {
        if (!active) return;
        if (environment?.connectionState === "disconnected") {
          setError("Live connection required to load server settings.");
        } else {
          setError(null);
        }
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const next = await client.server.getSettings();
        if (!active) return;
        setSettings(next);
        setError(null);
      } catch (refreshError) {
        if (!active) return;
        setError(formatRemoteError(refreshError));
      } finally {
        if (active) setIsLoading(false);
      }
    }

    void refreshIfActive();
    return () => {
      active = false;
    };
  }, [environment?.connectionState, environmentId, getClient, sessionRevision]);

  return {
    settings,
    isLoading,
    error,
    isLive,
    refresh,
    updateSettings,
  };
}
