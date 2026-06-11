import { describe, expect, it } from "vitest";

import {
  defaultProtocolForHost,
  normalizeHostInput,
  normalizeHttpBaseUrl,
  normalizeWsBaseUrl,
  shouldUseHttpForHost,
} from "./network";

describe("network normalization", () => {
  it("uses cleartext transport for Tailscale CGNAT addresses", () => {
    expect(shouldUseHttpForHost("100.64.0.1")).toBe(true);
    expect(shouldUseHttpForHost("100.114.223.34")).toBe(true);
    expect(shouldUseHttpForHost("100.127.255.254")).toBe(true);
    expect(defaultProtocolForHost("100.114.223.34:3773")).toBe("http");
    expect(normalizeHostInput("100.114.223.34:3773")).toBe("http://100.114.223.34:3773");
  });

  it("does not classify public 100.x addresses as Tailscale", () => {
    expect(shouldUseHttpForHost("100.63.0.1")).toBe(false);
    expect(shouldUseHttpForHost("100.128.0.1")).toBe(false);
  });

  it("normalizes HTTP and WebSocket base URLs without credentials or paths", () => {
    expect(normalizeHttpBaseUrl("http://100.114.223.34:3773/pair#token=secret")).toBe(
      "http://100.114.223.34:3773/"
    );
    expect(normalizeWsBaseUrl("http://100.114.223.34:3773/pair#token=secret")).toBe(
      "ws://100.114.223.34:3773/"
    );
  });
});
