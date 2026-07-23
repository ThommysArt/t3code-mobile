const TRANSPORT_ERROR_PATTERNS = [
  /\bSocketCloseError\b/i,
  /\bSocketOpenError\b/i,
  /\bSocket is not connected\b/i,
  /Unable to connect to the T3 server WebSocket\./i,
  /\bis not connected\.$/i,
  /\bdisconnected\.$/i,
  /\bcould not establish a WebSocket connection\.$/i,
  /\bClientProtocolError\b/i,
  /\bRpcClientError\b/i,
  /\bping timeout\b/i,
  // React Native / Android / iOS socket abort strings that surface as close reasons
  // or Error.message values when the OS tears down a WebSocket.
  /\bsoftware caused connection abort\b/i,
  /\bsoftware closed (the )?connection\b/i,
  /\bconnection reset by peer\b/i,
  /\bconnection reset\b/i,
  /\bconnection aborted\b/i,
  /\bbroken pipe\b/i,
  /\bnetwork request failed\b/i,
  /\bnetworkerror\b/i,
  /\bECONNRESET\b/i,
  /\bECONNREFUSED\b/i,
  /\bEPIPE\b/i,
  /\bENOTCONN\b/i,
  /\bETIMEDOUT\b/i,
  /\bwebsocket is closed\b/i,
  /\bwebsocket connection (is )?closed\b/i,
  /\bconnection closed\b/i,
  /\bclosed before the connection was established\b/i,
  /\bthe environment did not respond before the connection timeout\b/i,
  /\bfailed to connect to the live thread stream\b/i,
  /\blive connection interrupted\b/i,
  /\blive connection paused\b/i,
  /\blive connection closed\b/i,
  /\breconnecting…\b/i,
  /\breconnecting\.\.\.\b/i,
] as const;

/**
 * Test whether an error message originates from a transport-level connection
 * failure (socket close, socket open, ping timeout, etc.) rather than a
 * business-logic error.
 */
export function isTransportConnectionErrorMessage(message: string | null | undefined): boolean {
  if (typeof message !== "string") {
    return false;
  }

  const normalizedMessage = message.trim();
  if (normalizedMessage.length === 0) {
    return false;
  }

  return TRANSPORT_ERROR_PATTERNS.some((pattern) => pattern.test(normalizedMessage));
}

/**
 * Strip transport connection errors from user-facing error messages.
 * Returns `null` for transport errors so the UI can distinguish between
 * real errors and transient connection issues.
 */
export function sanitizeThreadErrorMessage(message: string | null | undefined): string | null {
  return isTransportConnectionErrorMessage(message) ? null : (message ?? null);
}

/**
 * Map raw WebSocket close codes/reasons (often OS-level noise on mobile) into a
 * short, user-facing description. Empty when the close is intentional.
 */
export function formatTransportCloseMessage(input: {
  readonly code: number;
  readonly reason?: string | null;
  readonly intentional?: boolean;
}): string | null {
  if (input.intentional) {
    return null;
  }

  const reason = input.reason?.trim() ?? "";
  if (reason.length > 0) {
    if (isTransportConnectionErrorMessage(reason)) {
      return "Live connection interrupted. Reconnecting…";
    }
    return reason;
  }

  // 1000 = normal, 1001 = going away (tab/process sleep). Treat both as soft.
  if (input.code === 1000 || input.code === 1001) {
    return "Live connection paused. Reconnecting…";
  }

  // 1006 = abnormal closure without a close frame (very common on RN when the
  // OS or network aborts the socket).
  if (input.code === 1006) {
    return "Live connection interrupted. Reconnecting…";
  }

  return `Live connection closed (${input.code}). Reconnecting…`;
}
