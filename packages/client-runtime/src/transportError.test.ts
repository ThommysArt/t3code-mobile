import { describe, expect, it } from "vitest";

import {
  formatTransportCloseMessage,
  isTransportConnectionErrorMessage,
  sanitizeThreadErrorMessage,
} from "./transportError";

describe("transport errors", () => {
  it.each([
    "SocketCloseError: closed",
    "SocketOpenError: failed",
    "Socket is not connected",
    "Unable to connect to the T3 server WebSocket.",
    "T3 Code disconnected.",
    "T3 Code could not establish a WebSocket connection.",
    "ClientProtocolError: socket closed",
    "RpcClientError: connection interrupted",
    "ping timeout",
    "Software caused connection abort",
    "Software closed connection",
    "Software closed the connection",
    "Connection reset by peer",
    "Network request failed",
    "ECONNRESET",
    "WebSocket is closed",
    "Connection closed (1006).",
    "The environment did not respond before the connection timeout.",
  ])("treats %s as a transient connection error", (message) => {
    expect(isTransportConnectionErrorMessage(message)).toBe(true);
    expect(sanitizeThreadErrorMessage(message)).toBeNull();
  });

  it("keeps domain errors visible", () => {
    expect(isTransportConnectionErrorMessage("Provider authentication failed.")).toBe(false);
    expect(sanitizeThreadErrorMessage("Provider authentication failed.")).toBe(
      "Provider authentication failed."
    );
  });

  it("formats mobile OS close reasons for the UI", () => {
    expect(
      formatTransportCloseMessage({
        code: 1006,
        reason: "Software caused connection abort",
      })
    ).toBe("Live connection interrupted. Reconnecting…");
    expect(formatTransportCloseMessage({ code: 1006, reason: "" })).toBe(
      "Live connection interrupted. Reconnecting…"
    );
    expect(formatTransportCloseMessage({ code: 1000, reason: "", intentional: true })).toBeNull();
    expect(formatTransportCloseMessage({ code: 4401, reason: "Unauthorized" })).toBe(
      "Unauthorized"
    );
  });
});
