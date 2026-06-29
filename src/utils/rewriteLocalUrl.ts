import { shouldUseHttpForHost } from "./network";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

export function extractRemoteHost(httpBaseUrl: string): string | null {
  try {
    return new URL(httpBaseUrl).hostname || null;
  } catch {
    return null;
  }
}

export function rewriteLocalDevUrl(url: string, remoteHost: string | null): string {
  if (!remoteHost) {
    return url;
  }

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const isLocal =
      LOOPBACK_HOSTS.has(host) ||
      host.endsWith(".local") ||
      /^192\.168\./.test(host) ||
      /^10\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      /^100\.(6[4-9]|[78]\d|9\d|1[01]\d|12[0-7])\./.test(host);

    if (!isLocal) {
      return url;
    }

    parsed.hostname = remoteHost;
    if (shouldUseHttpForHost(remoteHost)) {
      parsed.protocol = "http:";
    }
    return parsed.toString();
  } catch {
    return url;
  }
}