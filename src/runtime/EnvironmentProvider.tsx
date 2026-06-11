import {
  applyShellStreamEvent,
  createEnvironmentConnection,
  createKnownEnvironment,
  createWsRpcClient,
  resolveRemoteWebSocketConnectionUrl,
  scopeProjectShell,
  scopeThreadShell,
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

import { bootstrapConnection, type ConnectionInput, type SavedConnection } from "./connection";
import { effectRuntime } from "./effectRuntime";
import { loadConnections, saveConnections } from "./storage";

export type EnvironmentConnectionState = "connecting" | "ready" | "reconnecting" | "disconnected";

export interface EnvironmentViewState {
  readonly connection: SavedConnection;
  readonly connectionState: EnvironmentConnectionState;
  readonly error: string | null;
  readonly snapshot: OrchestrationShellSnapshot | null;
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
  readonly getClient: (environmentId: EnvironmentId) => WsRpcClient | null;
  readonly getEnvironment: (environmentId: EnvironmentId) => EnvironmentViewState | null;
}

const EnvironmentContext = createContext<EnvironmentContextValue | null>(null);

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
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
        return {
          ...current,
          [environmentId]: update(environment),
        };
      });
    },
    []
  );

  const connectSaved = useCallback(
    async (savedConnection: SavedConnection): Promise<void> => {
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

      updateEnvironment(savedConnection.environmentId, (current) => ({
        ...current,
        connectionState: current.snapshot ? "reconnecting" : "connecting",
        error: null,
      }));

      const transport = new WsTransport(
        () =>
          effectRuntime.runPromise(
            resolveRemoteWebSocketConnectionUrl({
              wsBaseUrl: savedConnection.wsBaseUrl,
              httpBaseUrl: savedConnection.httpBaseUrl,
              bearerToken: savedConnection.bearerToken,
            })
          ),
        {
          onAttempt: () => {
            if (!isCurrentAttempt()) return;
            updateEnvironment(savedConnection.environmentId, (current) => ({
              ...current,
              connectionState: current.snapshot ? "reconnecting" : "connecting",
              error: null,
            }));
          },
          onError: (message) => {
            if (!isCurrentAttempt()) return;
            updateEnvironment(savedConnection.environmentId, (current) => ({
              ...current,
              connectionState: "disconnected",
              error: message,
            }));
          },
          onClose: ({ code, reason }, { intentional }) => {
            if (intentional || !isCurrentAttempt()) return;
            updateEnvironment(savedConnection.environmentId, (current) => ({
              ...current,
              connectionState: "disconnected",
              error: reason.trim() || `Connection closed (${code}).`,
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
      const environmentConnection = createEnvironmentConnection({
        kind: "saved",
        knownEnvironment,
        client,
        applyShellEvent: (event, environmentId) => {
          if (!isCurrentAttempt()) return;
          updateEnvironment(environmentId, (current) => ({
            ...current,
            snapshot: current.snapshot ? applyShellStreamEvent(current.snapshot, event) : null,
          }));
        },
        syncShellSnapshot: (snapshot, environmentId) => {
          if (!isCurrentAttempt()) return;
          updateEnvironment(environmentId, (current) => ({
            ...current,
            snapshot,
            connectionState: "ready",
            error: null,
          }));
        },
        onShellResubscribe: (environmentId) => {
          if (!isCurrentAttempt()) return;
          updateEnvironment(environmentId, (current) => ({
            ...current,
            connectionState: "reconnecting",
            error: null,
          }));
        },
      });

      if (!isCurrentAttempt()) {
        await environmentConnection.dispose().catch(() => undefined);
        return;
      }
      sessionsRef.current.set(savedConnection.environmentId, {
        connection: environmentConnection,
        client,
      });
      updateEnvironment(savedConnection.environmentId, (current) => ({
        ...current,
        sessionRevision: current.sessionRevision + 1,
      }));

      try {
        await withTimeout(environmentConnection.ensureBootstrapped(), 10_000);
      } catch (error) {
        if (!isCurrentAttempt()) return;
        updateEnvironment(savedConnection.environmentId, (current) => ({
          ...current,
          connectionState: "disconnected",
          error: errorMessage(error, "Failed to connect to the environment."),
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

    void loadConnections()
      .then(async (connections) => {
        if (cancelled) return;
        savedConnectionsRef.current = connections;
        setEnvironmentById(
          Object.fromEntries(
            connections.map((connection) => [
              connection.environmentId,
              {
                connection,
                connectionState: "connecting" as const,
                error: null,
                snapshot: null,
                sessionRevision: 0,
              },
            ])
          )
        );
        setIsBootstrapping(false);
        await Promise.all(connections.map((connection) => connectSaved(connection)));
      })
      .catch(() => {
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
      const connection = await bootstrapConnection(input);
      const current = savedConnectionsRef.current;
      const next = current.some((item) => item.environmentId === connection.environmentId)
        ? current.map((item) =>
            item.environmentId === connection.environmentId ? connection : item
          )
        : [...current, connection];

      await saveConnections(next);
      savedConnectionsRef.current = next;
      setEnvironmentById((environmentById) => ({
        ...environmentById,
        [connection.environmentId]: {
          connection,
          connectionState: "connecting",
          error: null,
          snapshot: environmentById[connection.environmentId]?.snapshot ?? null,
          sessionRevision: environmentById[connection.environmentId]?.sessionRevision ?? 0,
        },
      }));
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
    await saveConnections(next);
    savedConnectionsRef.current = next;
    setEnvironmentById((current) => {
      const nextState = { ...current };
      delete nextState[environmentId];
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
            .filter((thread) => thread.archivedAt === null)
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
