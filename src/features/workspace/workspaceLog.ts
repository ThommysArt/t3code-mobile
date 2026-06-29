import { logStatus } from "@/runtime/statusLog";

export function isWorkspaceDebugEnabled(): boolean {
  return (
    (typeof __DEV__ !== "undefined" && __DEV__) ||
    (typeof globalThis !== "undefined" &&
      (globalThis as { __T3_WORKSPACE_DEBUG__?: boolean }).__T3_WORKSPACE_DEBUG__ === true)
  );
}

export function workspaceLog(
  area: "tabs" | "terminal" | "browser" | "files" | "diff",
  message: string,
  data?: Record<string, unknown>
): void {
  if (isWorkspaceDebugEnabled()) {
    if (data !== undefined) {
      console.log(`[t3-workspace:${area}] ${message}`, data);
    } else {
      console.log(`[t3-workspace:${area}] ${message}`);
    }
  }

  logStatus("thread", "info", `Workspace ${area}: ${message}`, data ? JSON.stringify(data) : undefined, {
    toast: false,
  });
}

export function workspaceWarn(
  area: "tabs" | "terminal" | "browser" | "files" | "diff",
  message: string,
  data?: Record<string, unknown>
): void {
  if (isWorkspaceDebugEnabled()) {
    console.warn(`[t3-workspace:${area}] ${message}`, data);
  }

  logStatus("thread", "warning", `Workspace ${area}: ${message}`, data ? JSON.stringify(data) : undefined, {
    toast: false,
  });
}

export function workspaceError(
  area: "tabs" | "terminal" | "browser" | "files" | "diff",
  message: string,
  data?: Record<string, unknown>
): void {
  if (isWorkspaceDebugEnabled()) {
    console.error(`[t3-workspace:${area}] ${message}`, data);
  }

  logStatus("thread", "danger", `Workspace ${area}: ${message}`, data ? JSON.stringify(data) : undefined, {
    toast: false,
  });
}