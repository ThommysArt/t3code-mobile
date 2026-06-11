/** Tailscale CGNAT (100.64.0.0/10) and common LAN hosts should use plain HTTP/WS. */
const LOCAL_HTTP_HOST_PATTERN =
  /^(?:localhost|127(?:\.\d{1,3}){3}|100(?:\.\d{1,3}){3}|(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}|[^./:]+\.local|[^./:]+\.ts\.net)$/i;

export function shouldUseHttpForHost(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  if (!normalized) return false;
  return LOCAL_HTTP_HOST_PATTERN.test(normalized.split(":")[0] ?? normalized);
}

export function defaultProtocolForHost(host: string): "http" | "https" {
  const hostWithoutPort = host.trim().split("/")[0]?.split(":")[0] ?? host.trim();
  return shouldUseHttpForHost(hostWithoutPort) ? "http" : "https";
}

export function normalizeHostInput(host: string): string {
  const trimmed = host.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z][a-zA-Z\d+-]*:\/\//.test(trimmed) || trimmed.startsWith("//")) {
    return trimmed;
  }
  return `${defaultProtocolForHost(trimmed)}://${trimmed}`;
}

export function normalizeHttpBaseUrl(rawUrl: string): string {
  const url = new URL(rawUrl.includes("://") ? rawUrl : `${defaultProtocolForHost(rawUrl)}://${rawUrl}`);
  if (shouldUseHttpForHost(url.hostname)) {
    url.protocol = "http:";
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function normalizeWsBaseUrl(rawUrl: string): string {
  const url = new URL(rawUrl.includes("://") ? rawUrl : `${defaultProtocolForHost(rawUrl)}://${rawUrl}`);
  if (url.protocol === "http:" || (url.protocol === "https:" && shouldUseHttpForHost(url.hostname))) {
    url.protocol = "ws:";
  } else if (url.protocol === "https:") {
    url.protocol = "wss:";
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}