import { describe, expect, it } from "vitest";

import { isTransportConnectionErrorMessage, sanitizeThreadErrorMessage } from "./transportError";

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
});
