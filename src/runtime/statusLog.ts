export type StatusLevel = "info" | "success" | "warning" | "danger";

export type StatusScope = "app" | "db" | "environment" | "shell" | "thread";

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

type StatusListener = (event: StatusEvent) => void;

const listeners = new Set<StatusListener>();

export function subscribeStatus(listener: StatusListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitStatus(event: StatusEvent): void {
  const message = event.description
    ? `[${event.scope}] ${event.label}: ${event.description}`
    : `[${event.scope}] ${event.label}`;
  console.log(`[t3-mobile] ${message}`);
  for (const listener of listeners) {
    listener(event);
  }
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
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === "object" && error !== null) {
    const tagged = error as { readonly _tag?: string; readonly reason?: string; readonly message?: string };
    if (tagged.reason) {
      return `${tagged._tag ?? "error"}: ${tagged.reason}`;
    }
    if (tagged.message) {
      return tagged.message;
    }
  }
  return String(error);
}