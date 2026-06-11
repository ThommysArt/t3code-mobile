import {
  applyShellStreamEvent,
  countActiveThreads,
  createEnvironmentConnection,
  createKnownEnvironment,
  createWsRpcClient,
  fetchRemoteOrchestrationSnapshot,
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
import type { EnvironmentId, OrchestrationShellSnapshot } from "@t3tools/contracts";
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
  refreshSavedConnection,
  type ConnectionInput,
  type SavedConnection,
} from "./connection";
import {
  clearCachedShellSnapshot,
  clearCachedThreadDetailsForEnvironment,
  loadAllCachedShellSnapshots,
  saveCachedShellSnapshot,
} from "./db";
import { effectRuntime } from "./effectRuntime";
import { logStatus, formatRemoteError } from "./statusLog";
import { loadConnections, saveConnections } from "./storage";

const HTTP_SNAPSHOT_TIMEOUT_MS = 60_000;
const REMOTE_REQUEST_TIMEOUT_MS = 30_000;
const WS_BOOTSTRAP_TIMEOUT_MS = 60_000;

export type EnvironmentConnectionState = "connecting" | "ready" | "reconnecting" | "disconnected";

export interface EnvironmentViewState {
  readonly connection: SavedConnection;
  readonly connectionState: EnvironmentConnectionState;
  readonly error: string | null;
  readonly snapshot: OrchestrationShellSnapshot | null;
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
  readonly getClient: (environmentId: EnvironmentId) => WsRpcClient | null;
  readonly getEnvironment: (environmentId: EnvironmentId) => EnvironmentViewState | null;
}

const EnvironmentContext = createContext<EnvironmentContextValue | null>(null);

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function isActiveThread(thread: { readonly archivedAt: string | null }): boolean {
  return thread.archivedAt == null;
}

async function fetchHttpShellSnapshot(
  savedConnection: SavedConnection
): Promise<OrchestrationShellSnapshot | null> {
  try {
    const readModel = await effectRuntime.runPromise(
      fetchRemoteOrchestrationSnapshot({
        httpBaseUrl: savedConnection.httpBaseUrl,
        bearerToken: savedConnection.bearerToken,
        timeoutMs: HTTP_SNAPSHOT_TIMEOUT_MS,
      })
    );
    return toShellSnapshot(readModel);
  } catch (error) {
    logStatus(
      "shell",
      "warning",
      "HTTP snapshot failed",
      formatRemoteError(error),
      { environmentId: savedConnection.environmentId, toast: false }
    );
    return null;
  }
}

function connectionPhaseForState(
  state: EnvironmentConnectionState
): "connecting" | "syncing" | "connected" | "reconnecting" | "disconnected" | "error" {
  switch (state) {
    case "ready":
      return "connected";
    case "reconnecting":
      return "reconnecting";
    case "disconnected":
      return "disconnected";
    default:
      return "connecting";
  }
}

function shouldReconnect(existing: EnvironmentViewState | undefined): boolean {
  if (!existing) return false;
  if (existing.connectionState === "disconnected" || existing.connectionState === "reconnecting") {
    return true;
  }
  return existing.connectionState === "ready" && !existing.isCachedSnapshot;
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

export function EnvironmentProvider({ children }: PropsWithChildren) {
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [environmentById, setEnvironmentById] = useState<
    Readonly<Record<string, EnvironmentViewState>>
  >({});
  const sessionsRef = useRef(new Map<EnvironmentId, SessionEntry>());
  const connectionAttemptsRef = useRef(new Map<EnvironmentId, symbol>());
  const savedConnectionsRef = useRef<readonly SavedConnection[]>([]);
  const environmentByIdRef = useRef<Readonly<Record<string, EnvironmentViewState>>>({});
  const shellReloadInProgressRef = useRef(new Set<string>());
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

  const connectSaved = useCallback(
    async (savedConnectionInput: SavedConnection): Promise<void> => {
      let savedConnection = normalizeSavedConnection(savedConnectionInput);
      if (savedConnection.pairingInput) {
        const refreshed = await refreshSavedConnection(savedConnection);
        if (refreshed.bearerToken !== savedConnection.bearerToken) {
          savedConnection = refreshed;
          const next = savedConnectionsRef.current.map((connection) =>
            connection.environmentId === savedConnection.environmentId ? savedConnection : connection
          );
          savedConnectionsRef.current = next;
          await saveConnections(next);
          updateEnvironment(savedConnection.environmentId, (current) => ({
            ...current,
            connection: savedConnection,
          }));
        } else {
          savedConnection = refreshed;
        }
      }

      const attemptId = Symbol(savedConnection.environmentId);
      connectionAttemptsRef.current.set(savedConnection.environmentId, attemptId);
      const isCurrentAttempt = () =>
        connectionAttemptsRef.current.get(savedConnection.environmentId) === attemptId;
      const existing = sessionsRef.current.get(savedConnection.environmentId);
      sessionsRef.current.delete(savedConnection.environmentId);
      if (existing) {
        await existing.connection.dispose().catch(() => undefined);
      }
      if (!isCurrentAttempt()) return;

      const existingEnvironment = environmentByIdRef.current[savedConnection.environmentId];
      const reconnecting = shouldReconnect(existingEnvironment);
      const initialConnectionState: EnvironmentConnectionState = reconnecting
        ? "reconnecting"
        : existingEnvironment?.snapshot
          ? "ready"
          : "connecting";
      logStatus(
        "environment",
        "info",
        reconnecting ? "Reconnecting" : existingEnvironment?.snapshot ? "Syncing" : "Connecting",
        `${savedConnection.label} (${savedConnection.displayUrl})`,
        {
          environmentId: savedConnection.environmentId,
          persistent: true,
          phase: connectionPhaseForState(initialConnectionState),
          inProgress: initialConnectionState !== "ready",
        }
      );
      updateEnvironment(savedConnection.environmentId, (current) => ({
        ...current,
        connectionState: initialConnectionState,
        error: null,
      }));

      const transport = new WsTransport(
        () =>
          effectRuntime.runPromise(
            resolveRemoteWebSocketConnectionUrl({
              wsBaseUrl: savedConnection.wsBaseUrl,
              httpBaseUrl: savedConnection.httpBaseUrl,
              bearerToken: savedConnection.bearerToken,
              timeoutMs: REMOTE_REQUEST_TIMEOUT_MS,
            })
          ),
        {
          onAttempt: (socketUrl) => {
            if (!isCurrentAttempt()) return;
            logStatus("environment", "info", "WebSocket connecting", socketUrl, {
              environmentId: savedConnection.environmentId,
              toast: false,
            });
          },
          onOpen: () => {
            if (!isCurrentAttempt()) return;
            logStatus("environment", "info", "WebSocket open", undefined, {
              environmentId: savedConnection.environmentId,
              toast: false,
            });
          },
          onError: (message) => {
            if (!isCurrentAttempt()) return;
            logStatus("environment", "danger", "Connection error", message, {
              environmentId: savedConnection.environmentId,
              persistent: true,
            });
            updateEnvironment(savedConnection.environmentId, (current) => ({
              ...current,
              connectionState: "disconnected",
              error: message,
            }));
          },
          onClose: ({ code, reason }, { intentional }) => {
            if (intentional || !isCurrentAttempt()) return;
            const detail = reason.trim() || `Connection closed (${code}).`;
            logStatus("environment", "warning", "Disconnected", detail, {
              environmentId: savedConnection.environmentId,
              persistent: true,
            });
            updateEnvironment(savedConnection.environmentId, (current) => ({
              ...current,
              connectionState: "disconnected",
              error: detail,
            }));
          },
        }
      );
      const client = createWsRpcClient(transport);
      const knownEnvironment = {
        ...createKnownEnvironment({
          id: savedConnection.environmentId,
          label: savedConnection.label,
          source: "manual",
          target: {
            httpBaseUrl: savedConnection.httpBaseUrl,
            wsBaseUrl: savedConnection.wsBaseUrl,
          },
        }),
        environmentId: savedConnection.environmentId,
      };
      const sessionEntry: SessionEntry = {
        connection: createEnvironmentConnection({
          kind: "saved",
          knownEnvironment,
          client,
          applyShellEvent: (event, environmentId) => {
            if (sessionsRef.current.get(environmentId) !== sessionEntry) return;
            updateEnvironment(environmentId, (current) => ({
              ...current,
              snapshot: current.snapshot ? applyShellStreamEvent(current.snapshot, event) : null,
            }));
          },
          syncShellSnapshot: (snapshot, environmentId) => {
            if (sessionsRef.current.get(environmentId) !== sessionEntry) return;
            if (!shellReloadInProgressRef.current.has(environmentId)) {
              logStatus(
                "shell",
                "success",
                "Shell snapshot synced",
                `${countActiveThreads(snapshot)} threads, ${snapshot.projects.length} projects (seq ${snapshot.snapshotSequence})`,
                { environmentId, persistent: true, phase: "connected", inProgress: false }
              );
            }
            void saveCachedShellSnapshot(environmentId, snapshot).catch(() => undefined);
            updateEnvironment(environmentId, (current) => ({
              ...current,
              snapshot,
              connectionState: "ready",
              error: null,
              isCachedSnapshot: false,
              cachedSnapshotReceivedAt: null,
            }));
          },
          onShellResubscribe: (environmentId) => {
            if (sessionsRef.current.get(environmentId) !== sessionEntry) return;
            logStatus("shell", "info", "Resubscribing shell stream", undefined, {
              environmentId,
              toast: false,
            });
          },
        }),
        client,
      };

      if (!isCurrentAttempt()) {
        await sessionEntry.connection.dispose().catch(() => undefined);
        return;
      }
      sessionsRef.current.set(savedConnection.environmentId, sessionEntry);

      const applyHttpSnapshot = (snapshot: OrchestrationShellSnapshot, source: "http" | "fallback") => {
        if (sessionsRef.current.get(savedConnection.environmentId) !== sessionEntry) return;
        logStatus(
          "shell",
          source === "fallback" ? "warning" : "success",
          source === "fallback" ? "HTTP fallback snapshot" : "Shell snapshot synced",
          `${countActiveThreads(snapshot)} threads, ${snapshot.projects.length} projects (seq ${snapshot.snapshotSequence})`,
          {
            environmentId: savedConnection.environmentId,
            persistent: true,
            phase: source === "fallback" ? "disconnected" : "connected",
          }
        );
        void saveCachedShellSnapshot(savedConnection.environmentId, snapshot).catch(() => undefined);
        updateEnvironment(savedConnection.environmentId, (current) => ({
          ...current,
          snapshot,
          connectionState: "ready",
          error:
            source === "fallback"
              ? (current.error ?? "Live shell stream unavailable. Showing HTTP snapshot.")
              : null,
          isCachedSnapshot: false,
          cachedSnapshotReceivedAt: null,
        }));
      };

      updateEnvironment(savedConnection.environmentId, (current) => ({
        ...current,
        sessionRevision: current.sessionRevision + 1,
      }));

      try {
        await withTimeout(sessionEntry.connection.ensureBootstrapped(), WS_BOOTSTRAP_TIMEOUT_MS);
        if (!isCurrentAttempt()) return;
        logStatus("environment", "success", "Connected", savedConnection.label, {
          environmentId: savedConnection.environmentId,
          persistent: true,
          phase: "connected",
          inProgress: false,
        });
        updateEnvironment(savedConnection.environmentId, (current) => ({
          ...current,
          connectionState: "ready",
          error: null,
          isCachedSnapshot: false,
          cachedSnapshotReceivedAt: null,
        }));
      } catch (error) {
        if (!isCurrentAttempt()) return;
        const httpSnapshot = await fetchHttpShellSnapshot(savedConnection);
        if (httpSnapshot) {
          applyHttpSnapshot(httpSnapshot, "fallback");
          logStatus(
            "environment",
            "warning",
            "Using HTTP fallback",
            errorMessage(error, "WebSocket shell stream timed out."),
            { environmentId: savedConnection.environmentId, persistent: true }
          );
          return;
        }
        const message = errorMessage(error, "Failed to connect to the environment.");
        logStatus("environment", "danger", "Bootstrap failed", message, {
          environmentId: savedConnection.environmentId,
          persistent: true,
        });
        updateEnvironment(savedConnection.environmentId, (current) => ({
          ...current,
          connectionState: "disconnected",
          error: message,
        }));
      }
    },
    [updateEnvironment]
  );

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    const sessions = sessionsRef.current;
    const connectionAttempts = connectionAttemptsRef.current;

    logStatus("app", "info", "Starting app", "Loading saved connections and local cache");
    void Promise.all([loadConnections(), loadAllCachedShellSnapshots()])
      .then(async ([connections, cachedSnapshots]) => {
        if (cancelled) return;
        savedConnectionsRef.current = connections;
        logStatus(
          "app",
          "info",
          "Startup data loaded",
          `${connections.length} connection(s), ${cachedSnapshots.length} cached shell snapshot(s)`
        );
        const cachedByEnvironmentId = Object.fromEntries(
          cachedSnapshots.map((cached) => [cached.environmentId, cached])
        );
        const initialEnvironmentById = Object.fromEntries(
            connections.map((connection) => {
              const cached = cachedByEnvironmentId[connection.environmentId];
              if (cached) {
                const activeThreads = cached.snapshot.threads.filter(isActiveThread);
                logStatus(
                  "db",
                  "info",
                  "Hydrated cached shell",
                  `${connection.label}: ${activeThreads.length} threads, ${cached.snapshot.projects.length} projects`,
                  { environmentId: connection.environmentId }
                );
              }
              return [
                connection.environmentId,
                {
                  connection,
                  connectionState: (cached ? "ready" : "connecting") as EnvironmentConnectionState,
                  error: null,
                  snapshot: cached?.snapshot ?? null,
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
        if (connections.length === 0) {
          logStatus("app", "warning", "No environments", "Connect a server from the Environments screen");
        }
        await Promise.all(connections.map((connection) => connectSaved(connection)));
      })
      .catch((error: unknown) => {
        logStatus(
          "app",
          "danger",
          "Startup failed",
          error instanceof Error ? error.message : "Unable to restore app state"
        );
        if (!cancelled) setIsBootstrapping(false);
      });

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      for (const session of sessions.values()) {
        if (!session.client.isHeartbeatFresh()) {
          void session.connection.reconnect().catch(() => undefined);
        }
      }
    });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      appStateSubscription.remove();
      const activeSessions = [...sessions.values()];
      sessions.clear();
      connectionAttempts.clear();
      for (const session of activeSessions) {
        void session.connection.dispose();
      }
    };
  }, [connectSaved]);

  const addConnection = useCallback(
    async (input: ConnectionInput) => {
      let connection: SavedConnection;
      try {
        connection = await bootstrapConnection(input);
      } catch (error) {
        logStatus(
          "environment",
          "danger",
          "Pairing failed",
          error instanceof Error ? error.message : "Unable to connect to the server"
        );
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
        const next = {
          ...environmentById,
          [connection.environmentId]: {
            connection,
            connectionState: "connecting" as const,
            error: null,
            snapshot: environmentById[connection.environmentId]?.snapshot ?? null,
            isCachedSnapshot: environmentById[connection.environmentId]?.isCachedSnapshot ?? false,
            cachedSnapshotReceivedAt:
              environmentById[connection.environmentId]?.cachedSnapshotReceivedAt ?? null,
            sessionRevision: environmentById[connection.environmentId]?.sessionRevision ?? 0,
          },
        };
        environmentByIdRef.current = next;
        return next;
      });
      await connectSaved(connection);
    },
    [connectSaved]
  );

  const removeConnection = useCallback(async (environmentId: EnvironmentId) => {
    connectionAttemptsRef.current.delete(environmentId);
    const session = sessionsRef.current.get(environmentId);
    sessionsRef.current.delete(environmentId);
    if (session) await session.connection.dispose().catch(() => undefined);

    const next = savedConnectionsRef.current.filter(
      (connection) => connection.environmentId !== environmentId
    );
    await Promise.all([
      saveConnections(next),
      clearCachedShellSnapshot(environmentId),
      clearCachedThreadDetailsForEnvironment(environmentId),
    ]);
    savedConnectionsRef.current = next;
    setEnvironmentById((current) => {
      const nextState = { ...current };
      delete nextState[environmentId];
      environmentByIdRef.current = nextState;
      return nextState;
    });
  }, []);

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
        ? savedConnectionsRef.current.filter((connection) => connection.environmentId === environmentId)
        : savedConnectionsRef.current;
      if (targets.length === 0) return;

      for (const savedConnectionInput of targets) {
        const savedConnection = normalizeSavedConnection(savedConnectionInput);
        const targetEnvironmentId = savedConnection.environmentId;

        logStatus("shell", "info", "Reloading threads", savedConnection.label, {
          environmentId: targetEnvironmentId,
          persistent: true,
          phase: "syncing",
          inProgress: true,
        });
        updateEnvironment(targetEnvironmentId, (current) => ({
          ...current,
          error: null,
        }));

        const session = sessionsRef.current.get(targetEnvironmentId);
        if (!session) {
          try {
            await connectSaved(savedConnection);
          } catch (error) {
            logStatus(
              "shell",
              "danger",
              "Reload failed",
              errorMessage(error, "Could not reconnect to the environment."),
              {
                environmentId: targetEnvironmentId,
                persistent: true,
                phase: "error",
                inProgress: false,
              }
            );
          }
          continue;
        }

        shellReloadInProgressRef.current.add(targetEnvironmentId);
        try {
          await withTimeout(session.connection.reconnect(), WS_BOOTSTRAP_TIMEOUT_MS);
          const snapshot = environmentByIdRef.current[targetEnvironmentId]?.snapshot;
          if (!snapshot) {
            throw new Error("No shell snapshot received from the server.");
          }
          logStatus(
            "shell",
            "success",
            "Threads reloaded",
            `${countActiveThreads(snapshot)} threads, ${snapshot.projects.length} projects (seq ${snapshot.snapshotSequence})`,
            {
              environmentId: targetEnvironmentId,
              persistent: true,
              phase: "connected",
              inProgress: false,
            }
          );
        } catch (error) {
          logStatus(
            "shell",
            "danger",
            "Reload failed",
            errorMessage(error, "Could not refresh threads from the server."),
            {
              environmentId: targetEnvironmentId,
              persistent: true,
              phase: "error",
              inProgress: false,
            }
          );
        } finally {
          shellReloadInProgressRef.current.delete(targetEnvironmentId);
        }
      }
    },
    [connectSaved, updateEnvironment]
  );

  const getClient = useCallback(
    (environmentId: EnvironmentId) => sessionsRef.current.get(environmentId)?.client ?? null,
    []
  );

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
      getClient,
      getEnvironment,
    }),
    [
      addConnection,
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
  if (!value) {
    throw new Error("useEnvironments must be used inside EnvironmentProvider.");
  }
  return value;
}
