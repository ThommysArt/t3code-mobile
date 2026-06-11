import {
  applyShellStreamEvent,
  countActiveThreads,
  createEnvironmentConnection,
  createKnownEnvironment,
  createWsRpcClient,
  dispatchRemoteOrchestrationCommand,
  fetchRemoteEnvironmentDescriptor,
  fetchRemoteOrchestrationSnapshot,
  fetchRemoteSessionState,
  resolveRemoteWebSocketConnectionUrl,
  scopeProjectShell,
  scopeThreadShell,
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
import { effectRuntime } from "./effectRuntime";
import { formatRemoteError, logStatus } from "./statusLog";
import { loadConnections, saveConnections } from "./storage";
import { shouldUseHttpForHost } from "@/utils/network";

const HTTP_REQUEST_TIMEOUT_MS = 30_000;
const CONNECTION_PROBE_TIMEOUT_MS = 8_000;
const WS_BOOTSTRAP_TIMEOUT_MS = 12_000;
const HTTP_POLL_INTERVAL_MS = 2_500;
const HTTP_POLL_MAX_DURATION_MS = 5 * 60_000;

export type EnvironmentConnectionState = "connecting" | "ready" | "reconnecting" | "disconnected";
export type EnvironmentDataSource = "live" | "http" | "cache" | "none";

export interface EnvironmentViewState {
  readonly connection: SavedConnection;
  readonly connectionState: EnvironmentConnectionState;
  readonly error: string | null;
  readonly snapshot: OrchestrationShellSnapshot | null;
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
  const host = new URL(connection.httpBaseUrl).hostname;
  if (!shouldUseHttpForHost(host)) return detail;
  return `This phone could not reach ${connection.httpBaseUrl} over Tailscale or the local network. Confirm Tailscale is connected on the phone and use a development build for plain HTTP servers.`;
}

function isActiveThread(thread: { readonly archivedAt: string | null }): boolean {
  return thread.archivedAt == null;
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
  const mountedRef = useRef(true);

  const updateEnvironment = useCallback(
    (
      environmentId: EnvironmentId,
      update: (current: EnvironmentViewState) => EnvironmentViewState
    ) => {
      if (!mountedRef.current) return;
      setEnvironmentById((current) => {
        const environment = current[environmentId];
        if (!environment) return current;
        const next = {
          ...current,
          [environmentId]: update(environment),
        };
        environmentByIdRef.current = next;
        return next;
      });
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

      const readModel = await effectRuntime.runPromise(
        fetchRemoteOrchestrationSnapshot({
          httpBaseUrl: savedConnection.httpBaseUrl,
          bearerToken: savedConnection.bearerToken,
          timeoutMs: HTTP_REQUEST_TIMEOUT_MS,
        })
      );
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

      const attemptId = Symbol(environmentId);
      connectionAttemptsRef.current.set(environmentId, attemptId);
      const isCurrentAttempt = () => connectionAttemptsRef.current.get(environmentId) === attemptId;

      const existing = sessionsRef.current.get(environmentId);
      sessionsRef.current.delete(environmentId);
      if (existing) await existing.connection.dispose().catch(() => undefined);
      if (!isCurrentAttempt()) return;

      const existingEnvironment = environmentByIdRef.current[environmentId];
      const reconnecting = existingEnvironment?.snapshot != null;
      logStatus(
        "environment",
        "info",
        reconnecting ? "Reconnecting" : "Connecting",
        `${savedConnection.label} (${savedConnection.displayUrl})`,
        {
          environmentId,
          persistent: true,
          phase: reconnecting ? "reconnecting" : "connecting",
          inProgress: true,
        }
      );
      updateEnvironment(environmentId, (current) => ({
        ...current,
        connection: savedConnection,
        connectionState: reconnecting ? "reconnecting" : "connecting",
        error: null,
        sessionRevision: current.sessionRevision + 1,
      }));

      try {
        await effectRuntime.runPromise(
          fetchRemoteEnvironmentDescriptor({
            httpBaseUrl: savedConnection.httpBaseUrl,
            timeoutMs: CONNECTION_PROBE_TIMEOUT_MS,
          })
        );
        await effectRuntime.runPromise(
          fetchRemoteSessionState({
            httpBaseUrl: savedConnection.httpBaseUrl,
            bearerToken: savedConnection.bearerToken,
            timeoutMs: CONNECTION_PROBE_TIMEOUT_MS,
          })
        );
        logStatus("environment", "success", "Server reachable", savedConnection.httpBaseUrl, {
          environmentId,
          toast: false,
        });
      } catch (error) {
        if (!isCurrentAttempt()) return;
        const message = isAuthFailure(error)
          ? "The saved session is no longer valid. Enter a new pairing code and pair this server again."
          : unreachableEnvironmentMessage(savedConnection, error);
        updateEnvironment(environmentId, (current) => ({
          ...current,
          connectionState: "disconnected",
          error: message,
          dataSource: current.snapshot ? "cache" : "none",
          sessionRevision: current.sessionRevision + 1,
        }));
        logStatus(
          "environment",
          "warning",
          isAuthFailure(error) ? "Re-pair required" : "Server unreachable",
          message,
          {
            environmentId,
            persistent: true,
            phase: "disconnected",
            inProgress: false,
          }
        );
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
            logStatus("environment", "info", "Opening WebSocket", savedConnection.label, {
              environmentId,
              toast: false,
            });
          },
          onOpen: () => {
            if (!isCurrentAttempt()) return;
            logStatus("environment", "info", "WebSocket opened", savedConnection.label, {
              environmentId,
              toast: false,
            });
          },
          onError: (message) => {
            if (!isCurrentAttempt()) return;
            logStatus("environment", "warning", "WebSocket error", message, {
              environmentId,
              toast: false,
            });
          },
          onClose: ({ code, reason }, { intentional }) => {
            if (intentional || !isCurrentAttempt()) return;
            const detail = reason.trim() || `Connection closed (${code}).`;
            updateEnvironment(environmentId, (current) => ({
              ...current,
              connectionState: "disconnected",
              error: detail,
              dataSource: current.snapshot ? current.dataSource : "none",
              sessionRevision: current.sessionRevision + 1,
            }));
            logStatus("environment", "warning", "Live connection lost", detail, {
              environmentId,
              persistent: true,
              phase: "disconnected",
              inProgress: false,
            });
            void syncHttpSnapshot(savedConnection, {
              quiet: true,
              reason: "WebSocket disconnected",
            }).catch(() => undefined);
          },
        },
        {
          logWarning: (message, metadata) => {
            logStatus("environment", "warning", message, metadata.error, {
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
          void saveCachedShellSnapshot(eventEnvironmentId, snapshot);
          updateEnvironment(eventEnvironmentId, (current) => ({
            ...current,
            snapshot,
            connectionState: "ready",
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
            "Live sync ready",
            `${countActiveThreads(snapshot)} threads, ${snapshot.projects.length} projects`,
            {
              environmentId: eventEnvironmentId,
              persistent: true,
              phase: "connected",
              inProgress: false,
            }
          );
        },
        onShellResubscribe: (eventEnvironmentId) => {
          if (sessionsRef.current.get(eventEnvironmentId) !== sessionEntry) return;
          updateEnvironment(eventEnvironmentId, (current) => ({
            ...current,
            connectionState: "reconnecting",
            sessionRevision: current.sessionRevision + 1,
          }));
          logStatus("shell", "info", "Resubscribing live data", savedConnection.label, {
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

      const httpSnapshotPromise = syncHttpSnapshot(savedConnection, {
        quiet: true,
        reason: "Connection bootstrap",
      }).catch((error: unknown) => {
        logStatus("shell", "warning", "HTTP snapshot unavailable", formatRemoteError(error), {
          environmentId,
          toast: false,
        });
        return null;
      });

      try {
        await withTimeout(environmentConnection.ensureBootstrapped(), WS_BOOTSTRAP_TIMEOUT_MS);
        if (!isCurrentAttempt()) return;
        logStatus("environment", "success", "Connected", savedConnection.label, {
          environmentId,
          persistent: true,
          phase: "connected",
          inProgress: false,
        });
      } catch (error) {
        if (!isCurrentAttempt()) return;
        sessionsRef.current.delete(environmentId);
        await environmentConnection.dispose().catch(() => undefined);
        const readModel = await httpSnapshotPromise;
        const message = errorMessage(error, "Failed to connect to the live thread stream.");
        updateEnvironment(environmentId, (current) => ({
          ...current,
          connectionState: "disconnected",
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
      }
    },
    [stopHttpPolling, syncHttpSnapshot, updateEnvironment]
  );

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
                error: null,
                snapshot: cached?.snapshot ?? null,
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
        const session = sessions.get(savedConnection.environmentId);
        if (!session?.client.isHeartbeatFresh()) {
          void connectSaved(savedConnection);
        }
      }
    });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      appStateSubscription.remove();
      for (const timer of pollTimers.values()) clearTimeout(timer);
      pollTimers.clear();
      pollDeadlines.clear();
      const activeSessions = [...sessions.values()];
      sessions.clear();
      connectionAttempts.clear();
      for (const session of activeSessions) void session.connection.dispose();
    };
  }, [connectSaved]);

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
            error: null,
            snapshot: environmentById[connection.environmentId]?.snapshot ?? null,
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

  const removeConnection = useCallback(
    async (environmentId: EnvironmentId) => {
      connectionAttemptsRef.current.delete(environmentId);
      stopHttpPolling(environmentId);
      const session = sessionsRef.current.get(environmentId);
      sessionsRef.current.delete(environmentId);
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
    [stopHttpPolling]
  );

  const reconnect = useCallback(
    async (environmentId: EnvironmentId) => {
      const savedConnection = savedConnectionsRef.current.find(
        (connection) => connection.environmentId === environmentId
      );
      if (savedConnection) await connectSaved(savedConnection);
    },
    [connectSaved]
  );

  const reloadThreads = useCallback(
    async (environmentId?: EnvironmentId) => {
      const targets = environmentId
        ? savedConnectionsRef.current.filter(
            (connection) => connection.environmentId === environmentId
          )
        : savedConnectionsRef.current;
      for (const connection of targets) {
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
    [connectSaved, syncHttpSnapshot]
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
    if (environmentByIdRef.current[environmentId]?.connectionState !== "ready") return null;
    return sessionsRef.current.get(environmentId)?.client ?? null;
  }, []);

  const environments = useMemo(
    () =>
      Object.values(environmentById).sort((left, right) =>
        left.connection.label.localeCompare(right.connection.label)
      ),
    [environmentById]
  );

  const projects = useMemo(
    () =>
      environments
        .flatMap((environment) =>
          (environment.snapshot?.projects ?? []).map((project) =>
            scopeProjectShell(environment.connection.environmentId, project)
          )
        )
        .sort((left, right) => left.title.localeCompare(right.title)),
    [environments]
  );

  const threads = useMemo(
    () =>
      environments
        .flatMap((environment) =>
          (environment.snapshot?.threads ?? [])
            .filter(isActiveThread)
            .map((thread) => scopeThreadShell(environment.connection.environmentId, thread))
        )
        .sort((left, right) =>
          (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt)
        ),
    [environments]
  );

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
    ]
  );

  return <EnvironmentContext.Provider value={value}>{children}</EnvironmentContext.Provider>;
}

export function useEnvironments(): EnvironmentContextValue {
  const value = useContext(EnvironmentContext);
  if (!value) throw new Error("useEnvironments must be used inside EnvironmentProvider.");
  return value;
}
