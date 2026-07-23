import type { EnvironmentId } from "@t3tools/contracts";
import { useEffect, useMemo, useState } from "react";

import {
  attachmentCacheKey,
  collectAttachmentIdsFromMessages,
  prefetchMessageAttachments,
  resolveAttachmentLocalUri,
} from "./attachmentCache";
import { useEnvironments } from "./EnvironmentProvider";

/**
 * Resolve a single message attachment to a local/cached URI.
 * Prefers an on-device file under the app cache directory (downloaded via the
 * signed Tailscale asset URL). Falls back to the signed remote URL while the
 * download is in flight or if caching fails.
 */
export function useAttachmentImageUri(
  environmentId: EnvironmentId | string | null | undefined,
  attachmentId: string | null | undefined
): {
  readonly uri: string | null;
  readonly cacheKey: string | null;
  readonly isLoading: boolean;
} {
  const { getClient, getEnvironment } = useEnvironments();
  const environment = environmentId ? getEnvironment(environmentId as EnvironmentId) : null;
  const [uri, setUri] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(environmentId && attachmentId));

  const cacheKey = useMemo(() => {
    if (!environmentId || !attachmentId) return null;
    return attachmentCacheKey(environmentId, attachmentId);
  }, [attachmentId, environmentId]);

  useEffect(() => {
    if (!environmentId || !attachmentId) {
      setUri(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    const client = getClient(environmentId as EnvironmentId);
    const httpBaseUrl = environment?.connection.httpBaseUrl ?? null;

    void resolveAttachmentLocalUri({
      environmentId,
      attachmentId,
      client,
      httpBaseUrl,
    }).then((next) => {
      if (cancelled) return;
      setUri(next);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    attachmentId,
    environment?.connection.httpBaseUrl,
    environment?.sessionRevision,
    environmentId,
    getClient,
  ]);

  return { uri, cacheKey, isLoading };
}

/**
 * When thread history is available, download every attachment image over the
 * live Tailscale HTTP base URL into the local cache directory.
 */
export function usePrefetchThreadAttachments(
  environmentId: EnvironmentId | string | null | undefined,
  messages: readonly {
    readonly attachments?: readonly { readonly id: string }[] | null;
  }[]
): void {
  const { getClient, getEnvironment } = useEnvironments();
  const environment = environmentId ? getEnvironment(environmentId as EnvironmentId) : null;
  const attachmentIds = useMemo(
    () => collectAttachmentIdsFromMessages(messages),
    [messages]
  );
  const attachmentKey = attachmentIds.join("\0");

  useEffect(() => {
    if (!environmentId || attachmentIds.length === 0) return;

    const client = getClient(environmentId as EnvironmentId);
    const httpBaseUrl = environment?.connection.httpBaseUrl ?? null;
    if (!client || !httpBaseUrl) return;

    void prefetchMessageAttachments({
      environmentId,
      attachmentIds,
      client,
      httpBaseUrl,
    });
    // attachmentKey captures attachmentIds content without identity churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- attachmentKey is the content key
  }, [
    attachmentKey,
    environment?.connection.httpBaseUrl,
    environment?.sessionRevision,
    environmentId,
    getClient,
  ]);
}
