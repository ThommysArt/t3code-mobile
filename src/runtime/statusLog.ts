import { compactProviderError } from "../utils/providerErrors";

let minimalLoggingEnabled = false;

export function setMinimalLoggingEnabled(enabled: boolean): void {
  minimalLoggingEnabled = enabled;
}

export function isMinimalLoggingEnabled(): boolean {
  return minimalLoggingEnabled;
}

export type StatusLevel = "info" | "success" | "warning" | "danger";

export type StatusScope = "app" | "db" | "environment" | "shell" | "thread" | "git";

export type RuntimeStatusPhase =
  | "idle"
  | "starting"
  | "connecting"
  | "syncing"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "error";

export interface StatusEvent {
  readonly id: number;
  readonly timestamp: string;
  readonly scope: StatusScope;
  readonly level: StatusLevel;
  readonly label: string;
  readonly description?: string;
  readonly environmentId?: string;
  readonly phase?: RuntimeStatusPhase;
  readonly inProgress?: boolean;
  readonly persistent?: boolean;
  readonly toast?: boolean;
}

type StatusEventInput = Omit<StatusEvent, "id" | "timestamp">;
type StatusListener = (event: StatusEvent) => void;
type StatusHistoryListener = () => void;

const MAX_HISTORY = 120;
const listeners = new Set<StatusListener>();
const historyListeners = new Set<StatusHistoryListener>();
let nextEventId = 1;
let history: readonly StatusEvent[] = [];

export function isStatusInProgress(event: Pick<StatusEvent, "phase" | "inProgress">): boolean {
  if (event.inProgress === true) return true;
  if (event.inProgress === false) return false;
  return (
    event.phase === "starting" ||
    event.phase === "connecting" ||
    event.phase === "syncing" ||
    event.phase === "reconnecting"
  );
}

export function sanitizeStatusText(value: string): string {
  return value
    .replace(
      /(^|[?&#\s])((?:token|ticket|access_token|code|credential)=)[^&#\s]+/gi,
      "$1$2[redacted]"
    )
    .replace(/(Bearer|DPoP)\s+[A-Za-z0-9._~+/-]+/gi, "$1 [redacted]")
    .replace(
      /("(?:token|ticket|accessToken|bearerToken|credential)"\s*:\s*")[^"]+(")/gi,
      "$1[redacted]$2"
    );
}

export function subscribeStatus(listener: StatusListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function subscribeStatusHistory(listener: StatusHistoryListener): () => void {
  historyListeners.add(listener);
  return () => historyListeners.delete(listener);
}

export function getStatusHistory(): readonly StatusEvent[] {
  return history;
}

export function clearStatusHistory(): void {
  history = [];
  for (const listener of historyListeners) listener();
}

export function shouldShowStatusToast(event: Pick<StatusEvent, "level" | "phase" | "persistent" | "toast">): boolean {
  if (event.toast === false) return false;
  if (!isMinimalLoggingEnabled()) return true;
  if (event.persistent) return true;
  if (event.level === "danger") return true;
  if (event.level === "warning" && (event.phase === "error" || event.phase === "disconnected")) {
    return true;
  }
  return false;
}

export function shouldShowStatusInPanel(event: Pick<StatusEvent, "level" | "phase" | "persistent">): boolean {
  if (!isMinimalLoggingEnabled()) return true;
  if (event.persistent) return true;
  if (event.level === "danger" || event.level === "warning") return true;
  if (event.phase === "error" || event.phase === "disconnected") return true;
  return false;
}

export function emitStatus(input: StatusEventInput): void {
  const event: StatusEvent = {
    ...input,
    id: nextEventId++,
    timestamp: new Date().toISOString(),
    label: sanitizeStatusText(input.label),
    ...(input.description ? { description: sanitizeStatusText(input.description) } : {}),
  };
  const message = event.description
    ? `[${event.scope}] ${event.label}: ${event.description}`
    : `[${event.scope}] ${event.label}`;

  if (event.level === "danger" || event.level === "warning") console.warn(`[t3-mobile] ${message}`);
  else console.log(`[t3-mobile] ${message}`);

  history = [...history.slice(-(MAX_HISTORY - 1)), event];
  for (const listener of historyListeners) listener();
  for (const listener of listeners) listener(event);
}

export function logStatus(
  scope: StatusScope,
  level: StatusLevel,
  label: string,
  description?: string,
  options?: Pick<StatusEvent, "environmentId" | "phase" | "inProgress" | "persistent" | "toast">
): void {
  emitStatus({
    scope,
    level,
    label,
    description,
    environmentId: options?.environmentId,
    phase: options?.phase,
    inProgress: options?.inProgress,
    persistent: options?.persistent,
    toast: options?.toast,
  });
}

export function formatRemoteError(error: unknown): string {
  const compact = (value: string) => sanitizeStatusText(compactProviderError(value));

  if (error instanceof Error && error.message.trim()) {
    return compact(error.message);
  }
  if (typeof error === "string" && error.trim()) {
    return compact(error);
  }
  if (typeof error === "object" && error !== null) {
    const tagged = error as {
      readonly _tag?: string;
      readonly reason?: string;
      readonly message?: string;
      readonly detail?: string;
    };
    if (tagged.reason) {
      return compact(`${tagged._tag ?? "error"}: ${tagged.reason}`);
    }
    if (tagged.message) {
      return compact(tagged.message);
    }
    if (tagged.detail) {
      return compact(tagged.detail);
    }
  }
  return compact(String(error));
}
