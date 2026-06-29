import type { KnownTerminalSession } from "@t3tools/client-runtime";
import { DEFAULT_TERMINAL_ID } from "@t3tools/contracts";

export function pickRunningTerminalSessionForBootstrap(
  sessions: ReadonlyArray<KnownTerminalSession>
): KnownTerminalSession | null {
  const running = sessions.filter(
    (session) => session.state.status === "running" || session.state.status === "starting"
  );
  if (running.length === 0) {
    return null;
  }

  return (
    running.find((session) => session.target.terminalId === DEFAULT_TERMINAL_ID) ??
    running[0] ??
    null
  );
}

export function resolveWorkspaceTerminalBootstrap(input: {
  readonly hasWorkspaceRoot: boolean;
  readonly hasOpened: boolean;
  readonly live: boolean;
}): { readonly kind: "idle" } | { readonly kind: "open" } {
  if (!input.live || !input.hasWorkspaceRoot || input.hasOpened) {
    return { kind: "idle" };
  }

  return { kind: "open" };
}

export function resolveTerminalRouteBootstrap(input: {
  readonly hasThread: boolean;
  readonly hasWorkspaceRoot: boolean;
  readonly hasOpened: boolean;
  readonly requestedTerminalId: string | null;
  readonly currentTerminalId: string;
  readonly runningTerminalId: string | null;
  readonly currentTerminalStatus: "starting" | "running" | "exited" | "error" | "closed";
  readonly hasCurrentTerminalHydration: boolean;
}):
  | { readonly kind: "idle" }
  | { readonly kind: "redirect"; readonly terminalId: string }
  | { readonly kind: "open" } {
  if (!input.hasThread || !input.hasWorkspaceRoot || input.hasOpened) {
    return { kind: "idle" };
  }

  if (
    input.requestedTerminalId === null &&
    input.runningTerminalId !== null &&
    input.runningTerminalId !== input.currentTerminalId
  ) {
    return { kind: "redirect", terminalId: input.runningTerminalId };
  }

  if (
    (input.currentTerminalStatus === "running" || input.currentTerminalStatus === "starting") &&
    input.hasCurrentTerminalHydration
  ) {
    return { kind: "idle" };
  }

  return { kind: "open" };
}