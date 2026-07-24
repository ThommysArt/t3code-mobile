import type { AssetCreateUrlResult, EnvironmentId } from "@t3tools/contracts";
import { resolveAssetUrl } from "@t3tools/shared/projectFavicon";
import { Directory, File, Paths } from "expo-file-system";
import { Image } from "expo-image";

import {
  attachmentCacheKey,
  attachmentMemoryKey,
  sanitizeAttachmentPathSegment,
} from "./attachmentCacheHelpers";

export type AttachmentCacheClient = {
  readonly assets: {
    readonly createUrl: (input: {
      readonly resource: {
        readonly _tag: "attachment";
        readonly attachmentId: string;
      };
    }) => Promise<AssetCreateUrlResult>;
  };
};

export {
  attachmentCacheKey,
  collectAttachmentIdsFromMessages,
} from "./attachmentCacheHelpers";

interface CachedAttachmentEntry {
  readonly localUri: string;
  readonly remoteUrl: string | null;
  readonly expiresAt: number;
}

const memoryCache = new Map<string, CachedAttachmentEntry>();
const inFlight = new Map<string, Promise<string | null>>();

function attachmentCacheDirectory(): Directory {
  return new Directory(Paths.cache, "message-attachments");
}

function attachmentCacheFile(
  environmentId: EnvironmentId | string,
  attachmentId: string
): File {
  return new File(
    attachmentCacheDirectory(),
    `${sanitizeAttachmentPathSegment(String(environmentId))}__${sanitizeAttachmentPathSegment(attachmentId)}`
  );
}

function ensureAttachmentCacheDirectory(): void {
  const directory = attachmentCacheDirectory();
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
}

function readLocalIfPresent(
  environmentId: EnvironmentId | string,
  attachmentId: string
): string | null {
  try {
    const file = attachmentCacheFile(environmentId, attachmentId);
    if (file.exists && file.size > 0) {
      return file.uri;
    }
  } catch {
    // Ignore cache inspection failures and re-fetch.
  }
  return null;
}

async function downloadToLocalCache(input: {
  readonly environmentId: EnvironmentId | string;
  readonly attachmentId: string;
  readonly remoteUrl: string;
}): Promise<string | null> {
  try {
    ensureAttachmentCacheDirectory();
    const destination = attachmentCacheFile(input.environmentId, input.attachmentId);
    const downloaded = await File.downloadFileAsync(input.remoteUrl, destination, {
      idempotent: true,
    });
    const localUri = downloaded.uri;
    const imageCacheKey = attachmentCacheKey(input.environmentId, input.attachmentId);
    // Seed expo-image disk cache so subsequent renders hit memory/disk quickly.
    await Image.writeToCacheAsync(localUri, imageCacheKey).catch(() => undefined);
    return localUri;
  } catch {
    return null;
  }
}

async function resolveSignedAttachmentUrl(input: {
  readonly client: AttachmentCacheClient;
  readonly httpBaseUrl: string;
  readonly attachmentId: string;
}): Promise<{ readonly url: string; readonly expiresAt: number } | null> {
  try {
    const result = await input.client.assets.createUrl({
      resource: {
        _tag: "attachment",
        attachmentId: input.attachmentId,
      },
    });
    const url = resolveAssetUrl(input.httpBaseUrl, result.relativeUrl);
    if (!url) return null;
    return {
      url,
      expiresAt: result.expiresAt,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve a message attachment to a local file URI.
 * Fetches a signed asset URL over the live (Tailscale) connection, downloads
 * the image into the app cache directory, and reuses that file later.
 */
export async function resolveAttachmentLocalUri(input: {
  readonly environmentId: EnvironmentId | string;
  readonly attachmentId: string;
  readonly client: AttachmentCacheClient | null | undefined;
  readonly httpBaseUrl: string | null | undefined;
  readonly forceRefresh?: boolean;
}): Promise<string | null> {
  const mapKey = attachmentMemoryKey(input.environmentId, input.attachmentId);
  if (!input.forceRefresh) {
    const remembered = memoryCache.get(mapKey);
    if (remembered && remembered.expiresAt > Date.now()) {
      return remembered.localUri;
    }
    const localUri = readLocalIfPresent(input.environmentId, input.attachmentId);
    if (localUri) {
      memoryCache.set(mapKey, {
        localUri,
        remoteUrl: remembered?.remoteUrl ?? null,
        // Local files do not expire with the signed URL; keep a long TTL.
        expiresAt: Date.now() + 7 * 24 * 60 * 60_000,
      });
      return localUri;
    }
  }

  const existing = inFlight.get(mapKey);
  if (existing) return existing;

  const task = (async () => {
    if (!input.client || !input.httpBaseUrl) return null;

    const signed = await resolveSignedAttachmentUrl({
      client: input.client,
      httpBaseUrl: input.httpBaseUrl,
      attachmentId: input.attachmentId,
    });
    if (!signed) return null;

    const localUri = await downloadToLocalCache({
      environmentId: input.environmentId,
      attachmentId: input.attachmentId,
      remoteUrl: signed.url,
    });
    if (!localUri) {
      // Fall back to the signed remote URL so the image can still render online.
      memoryCache.set(mapKey, {
        localUri: signed.url,
        remoteUrl: signed.url,
        expiresAt: Math.min(signed.expiresAt - 60_000, Date.now() + 30 * 60_000),
      });
      return signed.url;
    }

    memoryCache.set(mapKey, {
      localUri,
      remoteUrl: signed.url,
      expiresAt: Date.now() + 7 * 24 * 60 * 60_000,
    });
    return localUri;
  })();

  inFlight.set(mapKey, task);
  try {
    return await task;
  } finally {
    inFlight.delete(mapKey);
  }
}

/**
 * Prefetch every image attachment found in chat history into the local cache.
 * Safe to call repeatedly; already-cached ids are skipped.
 */
export async function prefetchMessageAttachments(input: {
  readonly environmentId: EnvironmentId | string;
  readonly attachmentIds: readonly string[];
  readonly client: AttachmentCacheClient | null | undefined;
  readonly httpBaseUrl: string | null | undefined;
  readonly concurrency?: number;
}): Promise<void> {
  if (!input.client || !input.httpBaseUrl || input.attachmentIds.length === 0) return;

  const uniqueIds = [...new Set(input.attachmentIds.filter((id) => id.trim().length > 0))];
  if (uniqueIds.length === 0) return;

  const concurrency = Math.max(1, Math.min(input.concurrency ?? 3, 6));
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < uniqueIds.length) {
      const index = nextIndex;
      nextIndex += 1;
      const attachmentId = uniqueIds[index];
      if (!attachmentId) continue;
      await resolveAttachmentLocalUri({
        environmentId: input.environmentId,
        attachmentId,
        client: input.client,
        httpBaseUrl: input.httpBaseUrl,
      });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, uniqueIds.length) }, () => worker()));
}

export function clearAttachmentMemoryCache(): void {
  memoryCache.clear();
}
