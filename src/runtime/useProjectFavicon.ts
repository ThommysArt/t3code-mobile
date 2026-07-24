import type { EnvironmentId } from "@t3tools/contracts";
import {
  isProjectFaviconFallbackUrl,
  resolveAssetUrl,
} from "@t3tools/shared/projectFavicon";
import { useEffect, useState } from "react";

import { useEnvironments } from "./EnvironmentProvider";

const loadedFaviconUrls = new Set<string>();
const urlCache = new Map<string, { readonly url: string | null; readonly expiresAt: number }>();

function cacheKey(environmentId: EnvironmentId, cwd: string): string {
  return `${environmentId}:${cwd}`;
}

/**
 * Resolves a signed project-favicon URL for a workspace root via assets.createUrl.
 * Falls back to null when the server reports the missing marker or the env is offline.
 */
export function useProjectFaviconUrl(
  environmentId: EnvironmentId | null | undefined,
  workspaceRoot: string | null | undefined
): {
  readonly url: string | null;
  readonly headers: Readonly<Record<string, string>> | undefined;
} {
  const { getClient, getEnvironment } = useEnvironments();
  const environment = environmentId ? getEnvironment(environmentId) : null;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!environmentId || !workspaceRoot) {
      setUrl(null);
      return;
    }

    const key = cacheKey(environmentId, workspaceRoot);
    const cached = urlCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      setUrl(cached.url);
      return;
    }

    const client = getClient(environmentId);
    const httpBaseUrl = environment?.connection.httpBaseUrl;
    if (!client || !httpBaseUrl) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    void client.assets
      .createUrl({ resource: { _tag: "project-favicon", cwd: workspaceRoot } })
      .then((result) => {
        if (cancelled) return;
        const resolved = resolveAssetUrl(httpBaseUrl, result.relativeUrl);
        const next =
          resolved && !isProjectFaviconFallbackUrl(resolved) ? resolved : null;
        urlCache.set(key, {
          url: next,
          // Refresh a bit before expiry; fall back to 30 minutes.
          expiresAt: Math.min(result.expiresAt - 60_000, Date.now() + 30 * 60_000),
        });
        setUrl(next);
      })
      .catch(() => {
        if (cancelled) return;
        urlCache.set(key, { url: null, expiresAt: Date.now() + 60_000 });
        setUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [
    environment?.connection.httpBaseUrl,
    environment?.sessionRevision,
    environmentId,
    getClient,
    workspaceRoot,
  ]);

  const headers = environment?.connection.bearerToken
    ? { Authorization: `Bearer ${environment.connection.bearerToken}` }
    : undefined;

  return { url, headers };
}

export function markProjectFaviconLoaded(url: string): void {
  loadedFaviconUrls.add(url);
}

export function isProjectFaviconPreloaded(url: string): boolean {
  return loadedFaviconUrls.has(url);
}
