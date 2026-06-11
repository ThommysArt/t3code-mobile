import { readHostedPairingRequest } from "@t3tools/shared/remote";

const MOBILE_PAIRING_URL_PARAM = "pairingUrl";

const PRIVATE_HOST_PATTERN =
  /^(?:localhost|127(?:\.\d{1,3}){3}|(?:10|192\.168|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}|[^./:]+\.local|[^./:]+\.ts\.net)(?::\d+)?(?:\/.*)?$/i;

export function normalizeHostInput(host: string): string {
  const trimmed = host.trim();
  if (!trimmed) return "";
  if (/^[a-zA-Z][a-zA-Z\d+-]*:\/\//.test(trimmed) || trimmed.startsWith("//")) {
    return trimmed;
  }
  return `${defaultProtocolForHost(trimmed)}://${trimmed}`;
}

function defaultProtocolForHost(host: string): "http" | "https" {
  const trimmed = host.trim();
  if (/^[a-zA-Z][a-zA-Z\d+-]*:\/\//.test(trimmed) || trimmed.startsWith("//")) {
    try {
      return new URL(trimmed.startsWith("//") ? `http:${trimmed}` : trimmed).protocol === "http:"
        ? "http"
        : "https";
    } catch {
      return "https";
    }
  }

  const hostWithoutPath = trimmed.split("/")[0] ?? trimmed;
  return PRIVATE_HOST_PATTERN.test(hostWithoutPath) ? "http" : "https";
}

export function buildPairingUrl(host: string, code: string): string {
  const h = host.trim();
  const c = code.trim();
  if (!h) return "";
  if (!c) return h;

  try {
    const protocol = defaultProtocolForHost(h);
    const url = new URL(h.includes("://") ? h : `${protocol}://${h}`);
    url.hash = new URLSearchParams([["token", c]]).toString();
    return url.toString();
  } catch {
    return `${h}#token=${c}`;
  }
}

export function parsePairingUrl(url: string): { host: string; code: string } {
  const trimmed = url.trim();
  if (!trimmed) return { host: "", code: "" };

  try {
    const parsed = new URL(trimmed);
    const hostedPairingRequest = readHostedPairingRequest(parsed);
    if (hostedPairingRequest) {
      return {
        host: hostedPairingRequest.host.replace(/\/$/, ""),
        code: hostedPairingRequest.token,
      };
    }

    const hashParams = new URLSearchParams(parsed.hash.slice(1));
    const hashToken = hashParams.get("token");
    const queryToken = parsed.searchParams.get("token");
    const code = hashToken || queryToken || "";

    parsed.hash = "";
    parsed.search = "";
    parsed.pathname = "/";
    return { host: parsed.toString().replace(/\/$/, ""), code };
  } catch {
    return { host: trimmed, code: "" };
  }
}

export function extractPairingUrlFromQrPayload(payload: string): string {
  const trimmed = payload.trim();
  if (!trimmed) {
    throw new Error("Scanned QR code did not contain a pairing URL.");
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol === "t3code:") {
      const pairingUrl = url.searchParams.get(MOBILE_PAIRING_URL_PARAM)?.trim() ?? "";
      if (pairingUrl.length > 0) {
        return pairingUrl;
      }
    }
  } catch {
    // Treat non-URL payloads as raw pairing-url text so the normal input validation can decide.
  }

  return trimmed;
}