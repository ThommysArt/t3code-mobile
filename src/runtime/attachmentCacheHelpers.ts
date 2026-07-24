import type { EnvironmentId } from "@t3tools/contracts";

export function sanitizeAttachmentPathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120);
}

export function attachmentCacheKey(
  environmentId: EnvironmentId | string,
  attachmentId: string
): string {
  return `attachment:${environmentId}:${attachmentId}`;
}

export function attachmentMemoryKey(
  environmentId: EnvironmentId | string,
  attachmentId: string
): string {
  return `${environmentId}::${attachmentId}`;
}

export function collectAttachmentIdsFromMessages(
  messages: readonly {
    readonly attachments?: readonly { readonly id: string; readonly type?: string }[] | null;
  }[]
): readonly string[] {
  const ids: string[] = [];
  for (const message of messages) {
    for (const attachment of message.attachments ?? []) {
      if (attachment.id) ids.push(attachment.id);
    }
  }
  return ids;
}
