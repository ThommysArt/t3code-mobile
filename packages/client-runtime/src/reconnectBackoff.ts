/**
 * Configuration for exponential reconnect backoff.
 */
export interface ReconnectBackoffConfig {
  /** Base delay in milliseconds before the first retry. */
  readonly initialDelayMs: number;
  /** Multiplier applied per retry (exponential factor). */
  readonly backoffFactor: number;
  /** Hard upper bound on delay in milliseconds. */
  readonly maxDelayMs: number;
  /** Maximum number of retries (0-based). `null` means unlimited. */
  readonly maxRetries: number | null;
}

/**
 * Sensible defaults for WebSocket reconnect backoff.
 *
 * Mobile clients lose sockets frequently (app backgrounding, Tailscale blips,
 * OS "software caused connection abort"). Match the upstream supervisor model
 * and keep retrying with a bounded delay instead of giving up after a few
 * attempts.
 *
 * - 1 s initial delay, doubling each retry, capped at 30 s, unlimited retries.
 */
export const DEFAULT_RECONNECT_BACKOFF: ReconnectBackoffConfig = {
  initialDelayMs: 1_000,
  backoffFactor: 2,
  maxDelayMs: 30_000,
  maxRetries: null,
};

/**
 * App-layer recovery backoff used when a live session drops and needs a full
 * transport re-establish (fresh WS ticket). Slightly more aggressive than the
 * socket-protocol defaults so the UI recovers quickly after a blip.
 */
export const APP_RECONNECT_BACKOFF: ReconnectBackoffConfig = {
  initialDelayMs: 750,
  backoffFactor: 2,
  maxDelayMs: 20_000,
  maxRetries: null,
};

/**
 * Calculate the reconnect delay for a given retry index using exponential
 * backoff. Returns `null` when `retryIndex` exceeds the configured maximum.
 */
export function getReconnectDelayMs(
  retryIndex: number,
  config: ReconnectBackoffConfig = DEFAULT_RECONNECT_BACKOFF,
): number | null {
  if (!Number.isInteger(retryIndex) || retryIndex < 0) {
    return null;
  }

  if (config.maxRetries !== null && retryIndex >= config.maxRetries) {
    return null;
  }

  return Math.min(
    Math.round(config.initialDelayMs * config.backoffFactor ** retryIndex),
    config.maxDelayMs,
  );
}
