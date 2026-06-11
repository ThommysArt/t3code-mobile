import { describe, expect, it } from "vitest";

import {
  buildPairingUrl,
  extractPairingUrlFromQrPayload,
  normalizeHostInput,
  parsePairingUrl,
} from "./pairing";

describe("mobile pairing", () => {
  it("builds a usable Tailscale pairing URL from host and code", () => {
    const url = buildPairingUrl("100.114.223.34:3773", "pair-secret");
    expect(url).toBe("http://100.114.223.34:3773/#token=pair-secret");
    expect(parsePairingUrl(url)).toEqual({
      host: "http://100.114.223.34:3773",
      code: "pair-secret",
    });
  });

  it("normalizes a bare Tailscale host to HTTP", () => {
    expect(normalizeHostInput("100.100.10.20:3773")).toBe("http://100.100.10.20:3773");
  });

  it("extracts pairing links from the mobile QR deep link", () => {
    const pairingUrl = "http://100.100.10.20:3773/#token=pair-secret";
    const payload = `t3code://pair?pairingUrl=${encodeURIComponent(pairingUrl)}`;
    expect(extractPairingUrlFromQrPayload(payload)).toBe(pairingUrl);
  });
});
