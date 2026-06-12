export function messageImageUrl(httpBaseUrl: string | null, attachmentId: string): string | null {
  if (!httpBaseUrl) return null;
  return new URL(`/attachments/${encodeURIComponent(attachmentId)}`, httpBaseUrl).toString();
}

export function attachmentHeaders(
  bearerToken: string | null
): Readonly<Record<string, string>> | undefined {
  return bearerToken ? { Authorization: `Bearer ${bearerToken}` } : undefined;
}
