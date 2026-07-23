import {
  APP_RECONNECT_BACKOFF,
  applyShellStreamEvent,
  countActiveThreads,
  createEnvironmentConnection,
  createKnownEnvironment,
  createWsRpcClient,
  dispatchRemoteOrchestrationCommand,
  fetchRemoteEnvironmentDescriptor,
  fetchRemoteOrchestrationSnapshot,
  fetchRemoteSessionState,
  formatTransportCloseMessage,
  getReconnectDelayMs,
  isTransportConnectionErrorMessage,
  resolveRemoteWebSocketConnectionUrl,
  toShellSnapshot,
  WsTransport,
  type EnvironmentConnection,
  type EnvironmentScopedProjectShell,
  type EnvironmentScopedThreadShell,
  type WsRpcClient,
} from "@t3tools/client-runtime";
import type {
  ClientOrchestrationCommand,
  DispatchResult,
  EnvironmentId,
  OrchestrationReadModel,
  OrchestrationShellSnapshot,
  ServerConfig,
} from "@t3tools/contracts";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";

import {
  bootstrapConnection,
  normalizeSavedConnection,
  type ConnectionInput,
  type SavedConnection,
} from "./connection";
import {
  clearCachedShellSnapshot,
  clearCachedThreadDetailsForEnvironment,
  loadAllCachedShellSnapshots,
  saveCachedShellSnapshot,
  saveCachedThreadDetail,
} from "./db";
import { buildScopedCatalog } from "./catalog";
import { effectRuntime } from "./effectRuntime";
import { formatRemoteError, logStatus } from "./statusLog";
import {
  subscribeTerminalMetadata,
  terminalSessionManager,
} from "./useTerminalSession";
import { loadConnections, saveConnections } from "./storage";
import {
  normalizeHostInput,
  normalizeHttpBaseUrl,
  normalizeWsBaseUrl,
  shouldUseHttpForHost,
} from "@/utils/network";
import { syncLatestThreadsWidget } from "@/features/widget/syncLatestThreadsWidget";
import { getPreferences } from "./preferences";

const HTTP_REQUEST_TIMEOUT_MS = 30_000;
const CONNECTION_PROBE_TIMEOUT_MS = 8_000;
const WS_BOOTSTRAP_TIMEOUT_MS = 12_000;
const HTTP_POLL_INTERVAL_MS = 2_500;
const HTTP_POLL_MAX_DURATION_MS = 5 * 60_000;
/** Wait briefly for Effect protocol auto-retry before forcing a full reconnect. */
const LIVE_RECOVERY_GRACE_MS = 3_500;
/** Heartbeat watchdog: reconnect when the live socket goes silent. */
const HEARTBEAT_WATCHDOG_MS = 20_000;
const HEARTBEAT_STALE_MS = 20_000;

export type EnvironmentConnectionState = "connecting" | "ready" | "reconnecting" | "disconnected";
export type EnvironmentDataSource = "live" | "http" | "cache" | "none";
export type EnvironmentConnectionStep =
  | "checking-server"
  | "validating-session"
  | "opening-websocket"
  | "syncing-threads"
  | "ready"
  | "refreshing-http"
  | "http-ready"
  | "offline";

export interface EnvironmentViewState {
  readonly connection: SavedConnection;
  readonly connectionState: EnvironmentConnectionState;
  readonly connectionStep: EnvironmentConnectionStep;
  readonly error: string | null;
  readonly snapshot: OrchestrationShellSnapshot | null;
  readonly serverConfig: ServerConfig | null;
  readonly dataSource: EnvironmentDataSource;
  readonly lastSyncedAt: string | null;
  readonly isCachedSnapshot: boolean;
  readonly cachedSnapshotReceivedAt: string | null;
  readonly sessionRevision: number;
}

interface SessionEntry {
  readonly connection: EnvironmentConnection;
  readonly client: WsRpcClient;
}

interface EnvironmentContextValue {
  readonly isBootstrapping: boolean;
  readonly environments: readonly EnvironmentViewState[];
  readonly projects: readonly EnvironmentScopedProjectShell[];
  readonly threads: readonly EnvironmentScopedThreadShell[];
  readonly addConnection: (input: ConnectionInput) => Promise<void>;
  readonly updateConnectionUrl: (environmentId: EnvironmentId, rawUrl: string) => Promise<void>;
  readonly removeConnection: (environmentId: EnvironmentId) => Promise<void>;
  readonly reconnect: (environmentId: EnvironmentId) => Promise<void>;
  readonly reloadThreads: (environmentId?: EnvironmentId) => Promise<void>;
  readonly dispatchCommand: (
    environmentId: EnvironmentId,
    command: ClientOrchestrationCommand
  ) => Promise<DispatchResult>;
  readonly getClient: (environmentId: EnvironmentId) => WsRpcClient | null;
  readonly getEnvironment: (environmentId: EnvironmentId) => EnvironmentViewState | null;
}

const EnvironmentContext = createContext<EnvironmentContextValue | null>(null);

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function isAuthFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    (error as { readonly _tag?: string })._tag === "EnvironmentAuthInvalidError"
  );
}

function unreachableEnvironmentMessage(connection: SavedConnection, error: unknown): string {
  const detail = formatRemoteError(error);
  if (isTransportConnectionErrorMessage(detail)) {
    return `Could not reach ${connection.label}. Check Tailscale or the local network and try again.`;
  }
  const host = new URL(connection.httpBaseUrl).hostname;
  if (!shouldUseHttpForHost(host)) return detail;
  return `This phone could not reach ${connection.httpBaseUrl} over Tailscale or the local network. Confirm Tailscale is connected on the phone and use a development build for plain HTTP servers.`;
}

function userFacingConnectionError(error: unknown, fallback: string): string {
  const message = errorMessage(error, fallback);
  if (isTransportConnectionErrorMessage(message)) {
    return "Live connection interrupted. Reconnecting…";
  }
  return message;
}

function isPermanentConnectionError(message: string | null | undefined): boolean {
  if (!message) return false;
  return (
    /no longer valid/i.test(message) ||
    /pair this server again/i.test(message) ||
    /re-pair required/i.test(message)
  );
}

function hasRunningThread(readModel: OrchestrationReadModel): boolean {
  return readModel.threads.some(
    (thread) => thread.session?.status === "running" || thread.session?.status === "starting"
  );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("The environment did not respond before the connection timeout."));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

async function persistReadModel(
  environmentId: EnvironmentId,
  readModel: OrchestrationReadModel
): Promise<void> {
  const shellSnapshot = toShellSnapshot(readModel);
  await Promise.all([
    saveCachedShellSnapshot(environmentId, shellSnapshot),
    ...readModel.threads.map((thread) =>
      saveCachedThreadDetail(environmentId, thread.id, thread, readModel.snapshotSequence)
    ),
  ]);
}

export function EnvironmentProvider({ children }: PropsWithChildren) {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [environmentById, setEnvironmentById] = useState<
    Readonly<Record<string, EnvironmentViewState>>
  >({});
  const sessionsRef = useRef(new Map<EnvironmentId, SessionEntry>());
  const connectionAttemptsRef = useRef(new Map<EnvironmentId, symbol>());
  const savedConnectionsRef = useRef<readonly SavedConnection[]>([]);
  const environmentByIdRef = useRef<Readonly<Record<string, EnvironmentViewState>>>({});
  const httpPollTimersRef = useRef(new Map<EnvironmentId, ReturnType<typeof setTimeout>>());
  const httpPollDeadlinesRef = useRef(new Map<EnvironmentId, number>());
  const recoveryTimersRef = useRef(new Map<EnvironmentId, ReturnType<typeof setTimeout>>());
  const recoveryAttemptsRef = useRef(new Map<EnvironmentId, number>());
  const terminalMetadataUnsubscribersRef = useRef(new Map<EnvironmentId, () => void>());
  const mountedRef = useRef(true);
  const connectSavedRef = useRef<(connection: SavedConnection) => Promise<void>>(async () => undefined);

  const clearTerminalMetadataSubscription = useCallback((environmentId: EnvironmentId) => {
    terminalMetadataUnsubscribersRef.current.get(environmentId)?.();
    terminalMetadataUnsubscribersRef.current.delete(environmentId);
    terminalSessionManager.invalidateEnvironment(environmentId);
  }, []);

  const clearLiveRecovery = useCallback((environmentId: EnvironmentId) => {
    const timer = recoveryTimersRef.current.get(environmentId);
    if (timer) clearTimeout(timer);
    recoveryTimersRef.current.delete(environmentId);
    recoveryAttemptsRef.current.delete(environmentId);
  }, []);

  const scheduleLiveRecovery = useCallback(
    (
      savedConnection: SavedConnection,
      options?: { readonly immediate?: boolean; readonly graceMs?: number }
    ) => {
      const environmentId = savedConnection.environmentId;
      const existingTimer = recoveryTimersRef.current.get(environmentId);
      if (existingTimer) clearTimeout(existingTimer);

      const attempt = recoveryAttemptsRef.current.get(environmentId) ?? 0;
      const delayMs = options?.immediate
        ? 0
        : options?.graceMs !== undefined
          ? options.graceMs
          : (getReconnectDelayMs(attempt, APP_RECONNECT_BACKOFF) ??
            APP_RECONNECT_BACKOFF.maxDelayMs);

      const timer = setTimeout(() => {
        recoveryTimersRef.current.delete(environmentId);
        if (!mountedRef.current) return;

        const environment = environmentByIdRef.current[environmentId];
        if (!environment) return;
        if (environment.connectionState === "ready" && environment.dataSource === "live") {
          recoveryAttemptsRef.current.delete(environmentId);
          return;
        }

        // Soft protocol retry did not restore live shell in time — force a full
        // reconnect with a fresh WS ticket. connectSaved cancels any prior attempt.
        recoveryAttemptsRef.current.set(environmentId, attempt + 1);
        logStatus(
          "environment",
          "info",
          "Auto-reconnecting",
          `${savedConnection.label} (attempt ${attempt + 1})`,
          {
            environmentId,
            phase: "reconnecting",
            inProgress: true,
            toast: false,
          }
        );
        void connectSavedRef.current(savedConnection).finally(() => {
          if (!mountedRef.current) return;
          const next = environmentByIdRef.current[environmentId];
          if (!next || (next.connectionState === "ready" && next.dataSource === "live")) {
            recoveryAttemptsRef.current.delete(environmentId);
            return;
          }
          // Auth/pairing failures need a human — do not spin forever.
          if (isPermanentConnectionError(next.error)) {
            recoveryAttemptsRef.current.delete(environmentId);
            return;
          }
          // Still not live — keep trying with exponential backoff.
          scheduleLiveRecovery(savedConnection);
        });
      }, delayMs);

      recoveryTimersRef.current.set(environmentId, timer);
    },
    []
  );

  const updateEnvironment = useCallback(
    (
      environmentId: EnvironmentId,
      update: (current: EnvironmentViewState) => EnvironmentViewState
    ) => {
      if (!mountedRef.current) return;
      const current = environmentByIdRef.current;
      const environment = current[environmentId];
      if (!environment) return;
      const next = {
        ...current,
        [environmentId]: update(environment),
      };
      environmentByIdRef.current = next;
      setEnvironmentById(next);
    },
    []
  );

  const stopHttpPolling = useCallback((environmentId: EnvironmentId) => {
    const timer = httpPollTimersRef.current.get(environmentId);
    if (timer) clearTimeout(timer);
    httpPollTimersRef.current.delete(environmentId);
    httpPollDeadlinesRef.current.delete(environmentId);
  }, []);

  const syncHttpSnapshot = useCallback(
    async (
      savedConnectionInput: SavedConnection,
      options?: { readonly quiet?: boolean; readonly reason?: string }
    ): Promise<OrchestrationReadModel> => {
      const savedConnection = normalizeSavedConnection(savedConnectionInput);
      const startedAt = Date.now();
      if (!options?.quiet) {
        logStatus("shell", "info", "Refreshing threads", options?.reason ?? savedConnection.label, {
          environmentId: savedConnection.environmentId,
          phase: "syncing",
          inProgress: true,
          persistent: true,
        });
      }
      updateEnvironment(savedConnection.environmentId, (current) => ({
        ...current,
        connectionStep: "refreshing-http",
      }));

      let readModel: OrchestrationReadModel;
      try {
        readModel = await effectRuntime.runPromise(
          fetchRemoteOrchestrationSnapshot({
            httpBaseUrl: savedConnection.httpBaseUrl,
            bearerToken: savedConnection.bearerToken,
            timeoutMs: HTTP_REQUEST_TIMEOUT_MS,
          })
        );
      } catch (error) {
        updateEnvironment(savedConnection.environmentId, (current) => ({
          ...current,
          connectionStep: current.connectionState === "ready" ? "ready" : "offline",
        }));
        throw error;
      }
      await persistReadModel(savedConnection.environmentId, readModel);
      const snapshot = toShellSnapshot(readModel);
      const receivedAt = new Date().toISOString();

      updateEnvironment(savedConnection.environmentId, (current) => {
        if (
          current.dataSource === "live" &&
          current.snapshot &&
          current.snapshot.snapshotSequence > snapshot.snapshotSequence
        ) {
          return current;
        }
        const isLive = current.connectionState === "ready" && current.dataSource === "live";
        return {
          ...current,
          snapshot,
          dataSource: isLive ? "live" : "http",
          connectionStep: isLive ? "ready" : "http-ready",
          lastSyncedAt: receivedAt,
          isCachedSnapshot: false,
          cachedSnapshotReceivedAt: null,
          sessionRevision: current.sessionRevision + (isLive ? 0 : 1),
        };
      });

      logStatus(
        "shell",
        "success",
        options?.quiet ? "HTTP sync complete" : "Threads refreshed",
        `${countActiveThreads(snapshot)} threads, ${snapshot.projects.length} projects in ${Date.now() - startedAt}ms`,
        {
          environmentId: savedConnection.environmentId,
          phase:
            environmentByIdRef.current[savedConnection.environmentId]?.connectionState === "ready"
              ? "connected"
              : "disconnected",
          inProgress: false,
          persistent: !options?.quiet,
          toast: !options?.quiet,
        }
      );
      return readModel;
    },
    [updateEnvironment]
  );

  const startHttpPolling = useCallback(
    (savedConnection: SavedConnection) => {
      const environmentId = savedConnection.environmentId;
      stopHttpPolling(environmentId);
      httpPollDeadlinesRef.current.set(environmentId, Date.now() + HTTP_POLL_MAX_DURATION_MS);
      logStatus("shell", "info", "HTTP live refresh started", savedConnection.label, {
        environmentId,
        toast: false,
      });
      let idlePollCount = 0;

      const poll = async () => {
        if (!mountedRef.current) return;
        const deadline = httpPollDeadlinesRef.current.get(environmentId) ?? 0;
        if (Date.now() >= deadline) {
          stopHttpPolling(environmentId);
          logStatus(
            "shell",
            "warning",
            "HTTP live refresh stopped",
            "Polling time limit reached.",
            {
              environmentId,
              toast: false,
            }
          );
          return;
        }

        try {
          const readModel = await syncHttpSnapshot(savedConnection, { quiet: true });
          if (hasRunningThread(readModel)) {
            idlePollCount = 0;
          } else {
            idlePollCount += 1;
          }
          if (idlePollCount >= 3) {
            stopHttpPolling(environmentId);
            logStatus("shell", "success", "HTTP live refresh complete", savedConnection.label, {
              environmentId,
              toast: false,
            });
            return;
          }
        } catch (error) {
          logStatus("shell", "warning", "HTTP refresh retrying", formatRemoteError(error), {
            environmentId,
            toast: false,
          });
        }

        const timer = setTimeout(() => void poll(), HTTP_POLL_INTERVAL_MS);
        httpPollTimersRef.current.set(environmentId, timer);
      };

      const timer = setTimeout(() => void poll(), 500);
      httpPollTimersRef.current.set(environmentId, timer);
    },
    [stopHttpPolling, syncHttpSnapshot]
  );

  const connectSaved = useCallback(
    async (savedConnectionInput: SavedConnection): Promise<void> => {
      const savedConnection = normalizeSavedConnection(savedConnectionInput);
      const environmentId = savedConnection.environmentId;
      stopHttpPolling(environmentId);
      // Cancel any pending delayed recovery so we don't double-connect.
      const pendingRecovery = recoveryTimersRef.current.get(environmentId);
      if (pendingRecovery) {
        clearTimeout(pendingRecovery);
        recoveryTimersRef.current.delete(environmentId);
      }

      const attemptId = Symbol(environmentId);
      connectionAttemptsRef.current.set(environmentId, attemptId);
      const isCurrentAttempt = () => connectionAttemptsRef.current.get(environmentId) === attemptId;

      const existing = sessionsRef.current.get(environmentId);
      sessionsRef.current.delete(environmentId);
      clearTerminalMetadataSubscription(environmentId);
      if (existing) await existing.connection.dispose().catch(() => undefined);
      if (!isCurrentAttempt()) return;

      const existingEnvironment = environmentByIdRef.current[environmentId];
      const reconnecting = existingEnvironment?.snapshot != null;
      logStatus(
        "environment",
        "info",
        reconnecting ? "Restoring connection" : "Connecting",
        `${savedConnection.label} (${savedConnection.displayUrl})`,
        {
          environmentId,
          persistent: true,
          phase: "connecting",
          inProgress: true,
        }
      );
      updateEnvironment(environmentId, (current) => ({
        ...current,
        connection: savedConnection,
        connectionState: reconnecting ? "reconnecting" : "connecting",
        connectionStep: "checking-server",
        error: null,
        sessionRevision: current.sessionRevision + 1,
      }));

      try {
        logStatus("environment", "info", "Checking server", savedConnection.httpBaseUrl, {
          environmentId,
          toast: false,
        });
        await effectRuntime.runPromise(
          fetchRemoteEnvironmentDescriptor({
            httpBaseUrl: savedConnection.httpBaseUrl,
            timeoutMs: CONNECTION_PROBE_TIMEOUT_MS,
          })
        );
        logStatus("environment", "success", "Server reachable", savedConnection.httpBaseUrl, {
          environmentId,
          toast: false,
        });
        updateEnvironment(environmentId, (current) => ({
          ...current,
          connectionStep: "validating-session",
        }));
        logStatus("environment", "info", "Validating saved session", savedConnection.label, {
          environmentId,
          toast: false,
        });
        await effectRuntime.runPromise(
          fetchRemoteSessionState({
            httpBaseUrl: savedConnection.httpBaseUrl,
            bearerToken: savedConnection.bearerToken,
            timeoutMs: CONNECTION_PROBE_TIMEOUT_MS,
          })
        );
        logStatus("environment", "success", "Saved session valid", savedConnection.label, {
          environmentId,
          toast: false,
        });
      } catch (error) {
        if (!isCurrentAttempt()) return;
        const authFailed = isAuthFailure(error);
        const message = authFailed
          ? "The saved session is no longer valid. Enter a new pairing code and pair this server again."
          : unreachableEnvironmentMessage(savedConnection, error);
        updateEnvironment(environmentId, (current) => ({
          ...current,
          connectionState: "disconnected",
          connectionStep: "offline",
          error: message,
          dataSource: current.snapshot ? "cache" : "none",
          sessionRevision: current.sessionRevision + 1,
        }));
        logStatus(
          "environment",
          "warning",
          authFailed ? "Re-pair required" : "Server unreachable",
          message,
          {
            environmentId,
            persistent: true,
            phase: "disconnected",
            inProgress: false,
          }
        );
        if (authFailed) {
          // Pairing is required — do not spin reconnect forever.
          clearLiveRecovery(environmentId);
        } else {
          scheduleLiveRecovery(savedConnection);
        }
        return;
      }

      const transport = new WsTransport(
        () =>
          effectRuntime.runPromise(
            resolveRemoteWebSocketConnectionUrl({
              wsBaseUrl: savedConnection.wsBaseUrl,
              httpBaseUrl: savedConnection.httpBaseUrl,
              bearerToken: savedConnection.bearerToken,
              timeoutMs: HTTP_REQUEST_TIMEOUT_MS,
            })
          ),
        {
          onAttempt: () => {
            if (!isCurrentAttempt()) return;
            updateEnvironment(environmentId, (current) => ({
              ...current,
              connectionStep: "opening-websocket",
              connectionState:
                current.connectionState === "ready" || current.connectionState === "reconnecting"
                  ? "reconnecting"
                  : current.connectionState,
            }));
            logStatus("environment", "info", "Opening WebSocket", savedConnection.label, {
              environmentId,
              toast: false,
            });
          },
          onOpen: () => {
            if (!isCurrentAttempt()) return;
            // Protocol recovered (or first open). Stay in reconnecting until shell snapshot
            // arrives, but clear sticky close banners so the UI stops yelling.
            updateEnvironment(environmentId, (current) => ({
              ...current,
              connectionStep: "syncing-threads",
              connectionState:
                current.connectionState === "disconnected" ||
                current.connectionState === "reconnecting"
                  ? "reconnecting"
                  : current.connectionState,
              error: null,
            }));
            logStatus("environment", "info", "WebSocket opened", savedConnection.label, {
              environmentId,
              toast: false,
            });
          },
          onError: (message) => {
            if (!isCurrentAttempt()) return;
            const detail = isTransportConnectionErrorMessage(message)
              ? "Live connection interrupted. Reconnecting…"
              : message;
            logStatus("environment", "warning", "WebSocket error", detail, {
              environmentId,
              toast: false,
            });
          },
          onClose: ({ code, reason }, { intentional }) => {
            if (intentional || !isCurrentAttempt()) return;
            const detail =
              formatTransportCloseMessage({ code, reason, intentional }) ??
              "Live connection interrupted. Reconnecting…";
            // Keep the session alive so Effect's socket retry + stream resubscribe can recover
            // without tearing down thread subscriptions. Only mark reconnecting — not offline.
            updateEnvironment(environmentId, (current) => ({
              ...current,
              connectionState: "reconnecting",
              connectionStep: "opening-websocket",
              error: detail,
              // Prefer HTTP/cache data over claiming "none" while we recover.
              dataSource:
                current.dataSource === "live"
                  ? current.snapshot
                    ? "http"
                    : "none"
                  : current.dataSource,
            }));
            logStatus("environment", "warning", "Live connection lost", detail, {
              environmentId,
              phase: "reconnecting",
              inProgress: true,
              toast: false,
            });
            void syncHttpSnapshot(savedConnection, {
              quiet: true,
              reason: "WebSocket disconnected",
            }).catch(() => undefined);
            // Give Effect's socket retry a short grace period, then force a full reconnect
            // with a fresh WS ticket if live shell has not returned.
            scheduleLiveRecovery(savedConnection, { graceMs: LIVE_RECOVERY_GRACE_MS });
          },
        },
        {
          logWarning: (message, metadata) => {
            const detail = isTransportConnectionErrorMessage(metadata.error)
              ? "Live connection interrupted. Reconnecting…"
              : metadata.error;
            logStatus("environment", "warning", message, detail, {
              environmentId,
              toast: false,
            });
          },
        }
      );
      const client = createWsRpcClient(transport);
      const knownEnvironment = {
        ...createKnownEnvironment({
          id: environmentId,
          label: savedConnection.label,
          source: "manual",
          target: {
            httpBaseUrl: savedConnection.httpBaseUrl,
            wsBaseUrl: savedConnection.wsBaseUrl,
          },
        }),
        environmentId,
      };

      let sessionEntry: SessionEntry;
      const environmentConnection = createEnvironmentConnection({
        kind: "saved",
        knownEnvironment,
        client,
        applyShellEvent: (event, eventEnvironmentId) => {
          if (sessionsRef.current.get(eventEnvironmentId) !== sessionEntry) return;
          updateEnvironment(eventEnvironmentId, (current) => {
            if (!current.snapshot) return current;
            const snapshot = applyShellStreamEvent(current.snapshot, event);
            void saveCachedShellSnapshot(eventEnvironmentId, snapshot);
            return {
              ...current,
              snapshot,
              dataSource: "live",
              lastSyncedAt: new Date().toISOString(),
              isCachedSnapshot: false,
              cachedSnapshotReceivedAt: null,
            };
          });
        },
        syncShellSnapshot: (snapshot, eventEnvironmentId) => {
          if (sessionsRef.current.get(eventEnvironmentId) !== sessionEntry) return;
          stopHttpPolling(eventEnvironmentId);
          const activeThreadCount = countActiveThreads(snapshot);
          logStatus(
            "shell",
            "info",
            "Shell snapshot received",
            `${activeThreadCount} active threads, ${snapshot.projects.length} projects`,
            {
              environmentId: eventEnvironmentId,
              phase: "syncing",
              inProgress: true,
              toast: false,
            }
          );
          void saveCachedShellSnapshot(eventEnvironmentId, snapshot);
          clearLiveRecovery(eventEnvironmentId);
          updateEnvironment(eventEnvironmentId, (current) => ({
            ...current,
            snapshot,
            connectionState: "ready",
            connectionStep: "ready",
            error: null,
            dataSource: "live",
            lastSyncedAt: new Date().toISOString(),
            isCachedSnapshot: false,
            cachedSnapshotReceivedAt: null,
            sessionRevision: current.sessionRevision + 1,
          }));
          logStatus(
            "shell",
            "success",
            "Thread catalog ready",
            `${activeThreadCount} visible threads, ${snapshot.projects.length} projects`,
            {
              environmentId: eventEnvironmentId,
              persistent: true,
              phase: "connected",
              inProgress: false,
            }
          );
        },
        onConfigSnapshot: (serverConfig) => {
          if (sessionsRef.current.get(environmentId) !== sessionEntry) return;
          updateEnvironment(environmentId, (current) => ({
            ...current,
            serverConfig,
          }));
        },
        onShellResubscribe: (eventEnvironmentId) => {
          if (sessionsRef.current.get(eventEnvironmentId) !== sessionEntry) return;
          const current = environmentByIdRef.current[eventEnvironmentId];
          if (current?.snapshot) {
            // Soft recovery succeeded — cancel the full reconnect timer.
            clearLiveRecovery(eventEnvironmentId);
          }
          updateEnvironment(eventEnvironmentId, (env) => ({
            ...env,
            // Keep existing live data usable while the stream rehydrates. Do not bump
            // sessionRevision here — that would tear down thread subscriptions mid-recover.
            connectionState: env.snapshot ? "ready" : "reconnecting",
            connectionStep: "syncing-threads",
            error:
              env.error && isTransportConnectionErrorMessage(env.error) ? null : env.error,
            dataSource: env.snapshot ? "live" : env.dataSource,
          }));
          logStatus("shell", "info", "Refreshing live thread stream", savedConnection.label, {
            environmentId: eventEnvironmentId,
            toast: false,
          });
        },
      });
      sessionEntry = { connection: environmentConnection, client };

      if (!isCurrentAttempt()) {
        await environmentConnection.dispose().catch(() => undefined);
        return;
      }
      sessionsRef.current.set(environmentId, sessionEntry);

      try {
        await withTimeout(environmentConnection.ensureBootstrapped(), WS_BOOTSTRAP_TIMEOUT_MS);
        if (!isCurrentAttempt()) return;
        clearLiveRecovery(environmentId);
        updateEnvironment(environmentId, (current) => ({
          ...current,
          connectionState: "ready",
          connectionStep: "ready",
          error: null,
          dataSource: "live",
        }));
        logStatus("environment", "success", "Connected", savedConnection.label, {
          environmentId,
          persistent: true,
          phase: "connected",
          inProgress: false,
        });
        clearTerminalMetadataSubscription(environmentId);
        terminalMetadataUnsubscribersRef.current.set(
          environmentId,
          subscribeTerminalMetadata({
            environmentId,
            client,
          })
        );
      } catch (error) {
        if (!isCurrentAttempt()) return;
        sessionsRef.current.delete(environmentId);
        clearTerminalMetadataSubscription(environmentId);
        await environmentConnection.dispose().catch(() => undefined);
        logStatus("shell", "info", "Trying HTTP thread fallback", savedConnection.label, {
          environmentId,
          phase: "syncing",
          inProgress: true,
          toast: false,
        });
        const readModel = await syncHttpSnapshot(savedConnection, {
          quiet: true,
          reason: "WebSocket fallback",
        }).catch((httpError: unknown) => {
          logStatus("shell", "warning", "HTTP fallback unavailable", formatRemoteError(httpError), {
            environmentId,
            toast: false,
          });
          return null;
        });
        const message = userFacingConnectionError(
          error,
          "Failed to connect to the live thread stream."
        );
        updateEnvironment(environmentId, (current) => ({
          ...current,
          connectionState: "disconnected",
          connectionStep: readModel ? "http-ready" : "offline",
          error: message,
          dataSource: readModel ? "http" : current.snapshot ? current.dataSource : "none",
          sessionRevision: current.sessionRevision + 1,
        }));
        logStatus(
          "environment",
          readModel ? "warning" : "danger",
          readModel ? "Using HTTP sync" : "Connection failed",
          readModel
            ? `${message} Thread history and prompts remain available through HTTP.`
            : message,
          {
            environmentId,
            persistent: true,
            phase: readModel ? "disconnected" : "error",
            inProgress: false,
          }
        );
        // Bootstrap failed after dispose — keep retrying in the background.
        scheduleLiveRecovery(savedConnection);
      }
    },
    [
      clearLiveRecovery,
      clearTerminalMetadataSubscription,
      scheduleLiveRecovery,
      stopHttpPolling,
      syncHttpSnapshot,
      updateEnvironment,
    ]
  );

  // Keep the recovery scheduler pointing at the latest connectSaved.
  connectSavedRef.current = connectSaved;

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    const sessions = sessionsRef.current;
    const connectionAttempts = connectionAttemptsRef.current;
    const pollTimers = httpPollTimersRef.current;
    const pollDeadlines = httpPollDeadlinesRef.current;

    logStatus("app", "info", "Starting app", "Loading saved connections and local cache");
    void Promise.all([loadConnections(), loadAllCachedShellSnapshots()])
      .then(async ([connections, cachedSnapshots]) => {
        if (cancelled) return;
        savedConnectionsRef.current = connections;
        const cachedByEnvironmentId = Object.fromEntries(
          cachedSnapshots.map((cached) => [cached.environmentId, cached])
        );
        const initialEnvironmentById = Object.fromEntries(
          connections.map((connection) => {
            const cached = cachedByEnvironmentId[connection.environmentId];
            return [
              connection.environmentId,
              {
                connection,
                connectionState: (cached
                  ? "reconnecting"
                  : "connecting") as EnvironmentConnectionState,
                connectionStep: "checking-server" as const,
                error: null,
                snapshot: cached?.snapshot ?? null,
                serverConfig: null,
                dataSource: cached ? ("cache" as const) : ("none" as const),
                lastSyncedAt: cached?.snapshotReceivedAt ?? null,
                isCachedSnapshot: cached !== undefined,
                cachedSnapshotReceivedAt: cached?.snapshotReceivedAt ?? null,
                sessionRevision: 0,
              },
            ];
          })
        );
        environmentByIdRef.current = initialEnvironmentById;
        setEnvironmentById(initialEnvironmentById);
        setIsBootstrapping(false);
        logStatus(
          "app",
          "info",
          "Startup data loaded",
          `${connections.length} connection(s), ${cachedSnapshots.length} cached snapshot(s)`,
          { toast: false }
        );
        await Promise.all(connections.map((connection) => connectSaved(connection)));
      })
      .catch((error: unknown) => {
        logStatus("app", "danger", "Startup failed", formatRemoteError(error));
        if (!cancelled) setIsBootstrapping(false);
      });

    let previousAppState = AppState.currentState;
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      const wasInactive = previousAppState !== "active";
      previousAppState = nextState;
      if (nextState !== "active" || !wasInactive) return;

      for (const savedConnection of savedConnectionsRef.current) {
        const environment = environmentByIdRef.current[savedConnection.environmentId];
        if (environment?.connectionState === "connecting") {
          continue;
        }
        const session = sessions.get(savedConnection.environmentId);
        const heartbeatFresh = session?.client.isHeartbeatFresh(HEARTBEAT_STALE_MS) ?? false;
        // Re-establish after backgrounding when not fully live. Mobile OS routinely
        // aborts idle sockets ("software caused connection abort") while suspended.
        // Do not use lastSyncedAt alone — idle shells can be healthy for minutes.
        if (
          environment?.connectionState === "disconnected" ||
          environment?.connectionState === "reconnecting" ||
          environment?.dataSource !== "live" ||
          !session ||
          !heartbeatFresh
        ) {
          void connectSaved(savedConnection);
        }
      }
    });

    const heartbeatWatchdog = setInterval(() => {
      if (!mountedRef.current || AppState.currentState !== "active") return;
      for (const savedConnection of savedConnectionsRef.current) {
        const environmentId = savedConnection.environmentId;
        const environment = environmentByIdRef.current[environmentId];
        const session = sessions.get(environmentId);
        if (!environment || !session) continue;
        if (environment.connectionState !== "ready" || environment.dataSource !== "live") continue;
        if (session.client.isHeartbeatFresh(HEARTBEAT_STALE_MS)) continue;

        logStatus(
          "environment",
          "warning",
          "Live heartbeat stale",
          "Reconnecting silent WebSocket session.",
          { environmentId, toast: false, phase: "reconnecting", inProgress: true }
        );
        updateEnvironment(environmentId, (current) => ({
          ...current,
          connectionState: "reconnecting",
          connectionStep: "opening-websocket",
          error: "Live connection interrupted. Reconnecting…",
        }));
        scheduleLiveRecovery(savedConnection, { graceMs: 0 });
      }
    }, HEARTBEAT_WATCHDOG_MS);

    return () => {
      cancelled = true;
      mountedRef.current = false;
      appStateSubscription.remove();
      clearInterval(heartbeatWatchdog);
      for (const timer of pollTimers.values()) clearTimeout(timer);
      pollTimers.clear();
      pollDeadlines.clear();
      for (const timer of recoveryTimersRef.current.values()) clearTimeout(timer);
      recoveryTimersRef.current.clear();
      recoveryAttemptsRef.current.clear();
      const activeSessions = [...sessions.values()];
      sessions.clear();
      connectionAttempts.clear();
      for (const session of activeSessions) void session.connection.dispose();
    };
  }, [connectSaved, scheduleLiveRecovery, updateEnvironment]);

  const addConnection = useCallback(
    async (input: ConnectionInput) => {
      let connection: SavedConnection;
      try {
        connection = await bootstrapConnection(input);
      } catch (error) {
        logStatus("environment", "danger", "Pairing failed", formatRemoteError(error));
        throw error;
      }

      const current = savedConnectionsRef.current;
      const next = current.some((item) => item.environmentId === connection.environmentId)
        ? current.map((item) =>
            item.environmentId === connection.environmentId ? connection : item
          )
        : [...current, connection];
      await saveConnections(next);
      savedConnectionsRef.current = next;
      setEnvironmentById((environmentById) => {
        const nextState = {
          ...environmentById,
          [connection.environmentId]: {
            connection,
            connectionState: "connecting" as const,
            connectionStep: "checking-server" as const,
            error: null,
            snapshot: environmentById[connection.environmentId]?.snapshot ?? null,
            serverConfig: environmentById[connection.environmentId]?.serverConfig ?? null,
            dataSource: environmentById[connection.environmentId]?.dataSource ?? "none",
            lastSyncedAt: environmentById[connection.environmentId]?.lastSyncedAt ?? null,
            isCachedSnapshot: environmentById[connection.environmentId]?.isCachedSnapshot ?? false,
            cachedSnapshotReceivedAt:
              environmentById[connection.environmentId]?.cachedSnapshotReceivedAt ?? null,
            sessionRevision: environmentById[connection.environmentId]?.sessionRevision ?? 0,
          },
        };
        environmentByIdRef.current = nextState;
        return nextState;
      });
      await connectSaved(connection);
    },
    [connectSaved]
  );

  const updateConnectionUrl = useCallback(
    async (environmentId: EnvironmentId, rawUrl: string) => {
      const current = savedConnectionsRef.current.find(
        (connection) => connection.environmentId === environmentId
      );
      if (!current) throw new Error("Saved environment not found.");

      const normalizedInput = normalizeHostInput(rawUrl);
      const httpBaseUrl = normalizeHttpBaseUrl(normalizedInput);
      const wsBaseUrl = normalizeWsBaseUrl(normalizedInput);
      logStatus("environment", "info", "Checking updated server URL", httpBaseUrl, {
        environmentId,
        phase: "connecting",
        inProgress: true,
      });
      const descriptor = await effectRuntime.runPromise(
        fetchRemoteEnvironmentDescriptor({
          httpBaseUrl,
          timeoutMs: CONNECTION_PROBE_TIMEOUT_MS,
        })
      );
      if (descriptor.environmentId !== environmentId) {
        throw new Error(
          `That URL belongs to ${descriptor.label}, not the saved ${current.label} environment.`
        );
      }

      const updated = normalizeSavedConnection({
        ...current,
        label: descriptor.label,
        displayUrl: httpBaseUrl,
        httpBaseUrl,
        wsBaseUrl,
      });
      const nextConnections = savedConnectionsRef.current.map((connection) =>
        connection.environmentId === environmentId ? updated : connection
      );
      await saveConnections(nextConnections);
      savedConnectionsRef.current = nextConnections;
      updateEnvironment(environmentId, (environment) => ({
        ...environment,
        connection: updated,
        connectionStep: "checking-server",
      }));
      logStatus("environment", "success", "Server URL saved", httpBaseUrl, {
        environmentId,
      });
      await connectSaved(updated);
    },
    [connectSaved, updateEnvironment]
  );

  const removeConnection = useCallback(
    async (environmentId: EnvironmentId) => {
      connectionAttemptsRef.current.delete(environmentId);
      stopHttpPolling(environmentId);
      clearLiveRecovery(environmentId);
      const session = sessionsRef.current.get(environmentId);
      sessionsRef.current.delete(environmentId);
      clearTerminalMetadataSubscription(environmentId);
      if (session) await session.connection.dispose().catch(() => undefined);

      const nextConnections = savedConnectionsRef.current.filter(
        (connection) => connection.environmentId !== environmentId
      );
      await Promise.all([
        saveConnections(nextConnections),
        clearCachedShellSnapshot(environmentId),
        clearCachedThreadDetailsForEnvironment(environmentId),
      ]);
      savedConnectionsRef.current = nextConnections;
      setEnvironmentById((current) => {
        const nextState = { ...current };
        delete nextState[environmentId];
        environmentByIdRef.current = nextState;
        return nextState;
      });
    },
    [clearLiveRecovery, clearTerminalMetadataSubscription, stopHttpPolling]
  );

  const reconnect = useCallback(
    async (environmentId: EnvironmentId) => {
      const savedConnection = savedConnectionsRef.current.find(
        (connection) => connection.environmentId === environmentId
      );
      if (!savedConnection) return;
      clearLiveRecovery(environmentId);
      recoveryAttemptsRef.current.delete(environmentId);
      await connectSaved(savedConnection);
    },
    [clearLiveRecovery, connectSaved]
  );

  const reloadThreads = useCallback(
    async (environmentId?: EnvironmentId) => {
      const targets = environmentId
        ? savedConnectionsRef.current.filter(
            (connection) => connection.environmentId === environmentId
          )
        : savedConnectionsRef.current;
      for (const connection of targets) {
        const environment = environmentByIdRef.current[connection.environmentId];
        const session = sessionsRef.current.get(connection.environmentId);
        if (environment?.connectionState === "ready" && session) {
          updateEnvironment(connection.environmentId, (current) => ({
            ...current,
            connectionStep: "syncing-threads",
          }));
          logStatus("shell", "info", "Refreshing live threads", connection.label, {
            environmentId: connection.environmentId,
            phase: "syncing",
            inProgress: true,
          });
          try {
            await withTimeout(session.connection.reconnect(), WS_BOOTSTRAP_TIMEOUT_MS);
            continue;
          } catch (error) {
            logStatus("shell", "warning", "Live refresh failed", formatRemoteError(error), {
              environmentId: connection.environmentId,
              toast: false,
            });
          }
        }

        try {
          await syncHttpSnapshot(connection, { reason: "Manual refresh" });
        } catch (error) {
          logStatus("shell", "danger", "Thread refresh failed", formatRemoteError(error), {
            environmentId: connection.environmentId,
            persistent: true,
            phase: "error",
            inProgress: false,
          });
        }
        if (environmentByIdRef.current[connection.environmentId]?.connectionState !== "ready") {
          void connectSaved(connection);
        }
      }
    },
    [connectSaved, syncHttpSnapshot, updateEnvironment]
  );

  const dispatchCommand = useCallback(
    async (
      environmentId: EnvironmentId,
      command: ClientOrchestrationCommand
    ): Promise<DispatchResult> => {
      const environment = environmentByIdRef.current[environmentId];
      const savedConnection = savedConnectionsRef.current.find(
        (connection) => connection.environmentId === environmentId
      );
      if (!savedConnection) throw new Error("Environment connection is unavailable.");

      const session = sessionsRef.current.get(environmentId);
      if (session && environment?.connectionState === "ready") {
        try {
          const result = await session.client.orchestration.dispatchCommand(command);
          logStatus("thread", "success", "Prompt accepted", `Sequence ${result.sequence}`, {
            environmentId,
            toast: false,
          });
          return result;
        } catch (error) {
          logStatus("thread", "warning", "Live dispatch failed", formatRemoteError(error), {
            environmentId,
            toast: false,
          });
        }
      }

      logStatus("thread", "info", "Sending prompt over HTTP", savedConnection.label, {
        environmentId,
        phase: "syncing",
        inProgress: true,
      });
      const result = await effectRuntime.runPromise(
        dispatchRemoteOrchestrationCommand({
          httpBaseUrl: savedConnection.httpBaseUrl,
          bearerToken: savedConnection.bearerToken,
          command,
          timeoutMs: HTTP_REQUEST_TIMEOUT_MS,
        })
      );
      startHttpPolling(savedConnection);
      logStatus("thread", "success", "Prompt accepted over HTTP", `Sequence ${result.sequence}`, {
        environmentId,
      });
      return result;
    },
    [startHttpPolling]
  );

  const getClient = useCallback((environmentId: EnvironmentId) => {
    const environment = environmentByIdRef.current[environmentId];
    if (!environment) return null;
    // Keep the RPC client available while the socket is recovering so thread
    // subscriptions can resubscribe without a full remount thrash.
    if (
      environment.connectionState !== "ready" &&
      environment.connectionState !== "reconnecting"
    ) {
      return null;
    }
    return sessionsRef.current.get(environmentId)?.client ?? null;
  }, []);

  const environments = useMemo(
    () =>
      Object.values(environmentById).sort((left, right) =>
        left.connection.label.localeCompare(right.connection.label)
      ),
    [environmentById]
  );

  const catalog = useMemo(
    () =>
      buildScopedCatalog(
        environments.map((environment) => ({
          environmentId: environment.connection.environmentId,
          snapshot: environment.snapshot,
        }))
      ),
    [environments]
  );
  const projects = catalog.projects;
  const threads = catalog.threads;

  // Keep the Android home-screen widget in sync with the live catalog.
  useEffect(() => {
    if (isBootstrapping) return;
    const timeout = setTimeout(() => {
      const projectTitleByKey = new Map<string, string>();
      for (const project of projects) {
        projectTitleByKey.set(`${project.environmentId}:${project.id}`, project.title);
      }
      const settlementEnvironmentIds = new Set<EnvironmentId>();
      let hasKnownCapabilities = false;
      for (const environment of environments) {
        if (!environment.serverConfig) continue;
        hasKnownCapabilities = true;
        if (environment.serverConfig.environment.capabilities.threadSettlement === true) {
          settlementEnvironmentIds.add(environment.connection.environmentId);
        }
      }
      void syncLatestThreadsWidget({
        threads,
        projectTitleByKey,
        // Omit the set until at least one serverConfig is known so cached
        // settlement fields still classify correctly offline.
        settlementEnvironmentIds: hasKnownCapabilities ? settlementEnvironmentIds : undefined,
        autoSettleAfterDays: getPreferences().autoSettleAfterDays,
      });
    }, 750);
    return () => clearTimeout(timeout);
  }, [environments, isBootstrapping, projects, threads]);

  const getEnvironment = useCallback(
    (environmentId: EnvironmentId) => environmentById[environmentId] ?? null,
    [environmentById]
  );

  const value = useMemo<EnvironmentContextValue>(
    () => ({
      isBootstrapping,
      environments,
      projects,
      threads,
      addConnection,
      updateConnectionUrl,
      removeConnection,
      reconnect,
      reloadThreads,
      dispatchCommand,
      getClient,
      getEnvironment,
    }),
    [
      addConnection,
      dispatchCommand,
      environments,
      getClient,
      getEnvironment,
      isBootstrapping,
      projects,
      reconnect,
      reloadThreads,
      removeConnection,
      threads,
      updateConnectionUrl,
    ]
  );

  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>;
}

export function useEnvironments(): EnvironmentContextValue {
  const value = useContext(EnvironmentContext);
  if (!value) throw new Error("useEnvironments must be used inside EnvironmentProvider.");
  return value;
}
