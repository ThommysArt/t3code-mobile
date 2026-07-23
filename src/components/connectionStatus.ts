import type {
  EnvironmentConnectionState,
  EnvironmentConnectionStep,
  EnvironmentDataSource,
  EnvironmentViewState,
} from "@/runtime/EnvironmentProvider";

export type ConnectionStatusTone = {
  readonly label: string;
  readonly color: string;
  readonly isConnecting: boolean;
};

export function connectionStepLabel(step: EnvironmentConnectionStep | string): string {
  switch (step) {
    case "checking-server":
      return "Checking server";
    case "validating-session":
      return "Validating session";
    case "opening-websocket":
      return "Opening connection";
    case "syncing-threads":
      return "Syncing threads";
    case "refreshing-http":
      return "Refreshing";
    case "http-ready":
      return "HTTP sync";
    case "ready":
      return "Live";
    default:
      return "Offline";
  }
}

export function connectionStatusFromEnvironment(input: {
  readonly connectionState: EnvironmentConnectionState;
  readonly connectionStep?: EnvironmentConnectionStep | string;
  readonly dataSource: EnvironmentDataSource;
}): ConnectionStatusTone {
  const isConnecting =
    input.connectionState === "connecting" || input.connectionState === "reconnecting";

  if (input.connectionState === "ready" && input.dataSource === "live") {
    return { label: "Live", color: "#22c55e", isConnecting: false };
  }

  if (input.dataSource === "http") {
    return { label: "HTTP sync", color: "#f59e0b", isConnecting };
  }

  if (isConnecting) {
    const step = input.connectionStep;
    const label =
      step && step !== "offline" && step !== "ready"
        ? connectionStepLabel(step)
        : input.connectionState === "reconnecting"
          ? "Reconnecting"
          : "Connecting";
    return { label, color: "#60a5fa", isConnecting: true };
  }

  if (input.dataSource === "cache") {
    return { label: "Cached", color: "#737373", isConnecting: false };
  }

  return { label: "Offline", color: "#737373", isConnecting: false };
}

/** Aggregate status across environments for home / multi-env surfaces. */
export function aggregateConnectionStatus(
  environments: readonly EnvironmentViewState[]
): ConnectionStatusTone {
  if (environments.length === 0) {
    return { label: "Offline", color: "#737373", isConnecting: false };
  }

  const readyCount = environments.filter(
    (environment) =>
      environment.connectionState === "ready" && environment.dataSource === "live"
  ).length;
  const hasHttpData = environments.some((environment) => environment.dataSource === "http");
  const hasCachedData = environments.some((environment) => environment.dataSource === "cache");
  const isConnecting = environments.some(
    (environment) =>
      environment.connectionState === "connecting" ||
      environment.connectionState === "reconnecting"
  );
  const activeStep = environments.find(
    (environment) =>
      environment.connectionState !== "ready" || environment.dataSource !== "live"
  )?.connectionStep;

  if (readyCount > 0) {
    return { label: "Live", color: "#22c55e", isConnecting: false };
  }

  if (activeStep && activeStep !== "offline" && (isConnecting || hasHttpData)) {
    if (hasHttpData && !isConnecting) {
      return { label: "HTTP sync", color: "#f59e0b", isConnecting: false };
    }
    return {
      label: connectionStepLabel(activeStep),
      color: isConnecting ? "#60a5fa" : hasHttpData ? "#f59e0b" : "#737373",
      isConnecting,
    };
  }

  if (hasHttpData) {
    return { label: "HTTP sync", color: "#f59e0b", isConnecting: false };
  }

  if (isConnecting) {
    return {
      label: activeStep ? connectionStepLabel(activeStep) : "Connecting",
      color: "#60a5fa",
      isConnecting: true,
    };
  }

  if (hasCachedData) {
    return { label: "Cached", color: "#737373", isConnecting: false };
  }

  return { label: "Offline", color: "#737373", isConnecting: false };
}
