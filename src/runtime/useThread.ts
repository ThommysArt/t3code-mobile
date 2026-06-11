import { applyThreadDetailEvent } from "@t3tools/client-runtime";
import {
  CommandId,
  EnvironmentId,
  MessageId,
  ThreadId,
  type OrchestrationMessage,
  type OrchestrationThread,
} from "@t3tools/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { newId } from "@/utils/id";
import {
  clearCachedThreadDetail,
  loadCachedThreadDetail,
  saveCachedThreadDetail,
} from "./db";
import { useEnvironments } from "./EnvironmentProvider";
import { logStatus } from "./statusLog";

interface ThreadState {
  readonly data: OrchestrationThread | null;
  readonly isPending: boolean;
  readonly error: string | null;
  readonly isCached: boolean;
  readonly cachedReceivedAt: string | null;
}

export interface OptimisticMessage extends OrchestrationMessage {
  readonly optimistic?: true;
}

interface QueuedSend {
  readonly commandId: CommandId;
  readonly message: OptimisticMessage;
  readonly targetKey: string;
}

export function useThread(environmentIdRaw: string, threadIdRaw: string) {
  const environmentId = EnvironmentId.make(environmentIdRaw);
  const threadId = ThreadId.make(threadIdRaw);
  const { getClient, getEnvironment, threads } = useEnvironments();
  const environment = getEnvironment(environmentId);
  const shell = threads.find(
    (candidate) => candidate.environmentId === environmentId && candidate.id === threadId
  );
  const [state, setState] = useState<ThreadState>({
    data: null,
    isPending: true,
    error: null,
    isCached: false,
    cachedReceivedAt: null,
  });
  const [optimisticMessages, setOptimisticMessages] = useState<readonly OptimisticMessage[]>([]);
  const [queuedSends, setQueuedSends] = useState<readonly QueuedSend[]>([]);
  const [isDispatching, setIsDispatching] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const targetKey = `${environmentId}:${threadId}`;
  const targetKeyRef = useRef(targetKey);
  const snapshotSequenceRef = useRef(0);

  const persistThread = useCallback(
    (thread: OrchestrationThread, snapshotSequence: number) => {
      snapshotSequenceRef.current = snapshotSequence;
      void saveCachedThreadDetail(environmentId, threadId, thread, snapshotSequence).catch(
        () => undefined
      );
    },
    [environmentId, threadId]
  );

  useEffect(() => {
    if (targetKeyRef.current !== targetKey) {
      targetKeyRef.current = targetKey;
      snapshotSequenceRef.current = 0;
      setState({
        data: null,
        isPending: true,
        error: null,
        isCached: false,
        cachedReceivedAt: null,
      });
      setOptimisticMessages([]);
      setQueuedSends([]);
      setSendError(null);
    }

    let cancelled = false;
    const client = getClient(environmentId);

    void loadCachedThreadDetail(environmentId, threadId).then((cached) => {
      if (cancelled) return;
      if (!cached) {
        if (!client) {
          setState((current) => ({
            ...current,
            isPending: false,
          }));
        }
        logStatus("thread", "info", "No cached thread", threadId, { environmentId });
        return;
      }

      logStatus(
        "thread",
        "info",
        "Loaded cached thread",
        `${cached.thread.messages.length} messages`,
        { environmentId }
      );
      snapshotSequenceRef.current = cached.snapshotSequence;
      setState((current) => {
        if (current.data !== null && !current.isCached) return current;
        return {
          data: cached.thread,
          isPending: getClient(environmentId) !== null,
          error: null,
          isCached: true,
          cachedReceivedAt: cached.snapshotReceivedAt,
        };
      });
    });

    if (!client) {
      return () => {
        cancelled = true;
      };
    }

    setState((current) => ({
      ...current,
      isPending: current.data === null,
      error: null,
    }));
    logStatus("thread", "info", "Subscribing to thread", threadId, { environmentId });
    const unsubscribe = client.orchestration.subscribeThread(
      { threadId },
      (item) => {
        if (item.kind === "snapshot") {
          logStatus(
            "thread",
            "success",
            "Thread snapshot received",
            `${item.snapshot.thread.messages.length} messages (seq ${item.snapshot.snapshotSequence})`,
            { environmentId }
          );
          persistThread(item.snapshot.thread, item.snapshot.snapshotSequence);
          setState({
            data: item.snapshot.thread,
            isPending: false,
            error: null,
            isCached: false,
            cachedReceivedAt: null,
          });
          setOptimisticMessages((current) =>
            current.filter(
              (optimistic) =>
                !item.snapshot.thread.messages.some((message) => message.id === optimistic.id)
            )
          );
          return;
        }

        setState((current) => {
          if (!current.data) return current;
          const result = applyThreadDetailEvent(current.data, item.event);
          if (result.kind === "updated") {
            persistThread(result.thread, snapshotSequenceRef.current);
            return {
              data: result.thread,
              isPending: false,
              error: null,
              isCached: false,
              cachedReceivedAt: null,
            };
          }
          if (result.kind === "deleted") {
            logStatus("thread", "warning", "Thread deleted", threadId, { environmentId });
            void clearCachedThreadDetail(environmentId, threadId).catch(() => undefined);
            return {
              data: null,
              isPending: false,
              error: "Thread deleted.",
              isCached: false,
              cachedReceivedAt: null,
            };
          }
          return current;
        });
      },
      {
        onResubscribe: () =>
          setState((current) => ({
            ...current,
            isPending: current.data === null,
            error: null,
          })),
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [environment?.sessionRevision, environmentId, getClient, persistThread, targetKey, threadId]);

  const messages = useMemo(() => {
    const confirmed = state.data?.messages ?? [];
    const confirmedIds = new Set(confirmed.map((message) => message.id));
    return [
      ...confirmed,
      ...optimisticMessages.filter((message) => !confirmedIds.has(message.id)),
    ].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }, [optimisticMessages, state.data?.messages]);

  useEffect(() => {
    const queued = queuedSends[0];
    const thread = state.data;
    const client = getClient(environmentId);
    const busy = thread?.session?.status === "running" || thread?.session?.status === "starting";
    if (!queued || queued.targetKey !== targetKey || !thread || !client || busy || isDispatching) {
      return;
    }

    setIsDispatching(true);
    void client.orchestration
      .dispatchCommand({
        type: "thread.turn.start",
        commandId: queued.commandId,
        threadId,
        message: {
          messageId: queued.message.id,
          role: "user",
          text: queued.message.text,
          attachments: [],
        },
        runtimeMode: thread.runtimeMode,
        interactionMode: thread.interactionMode,
        createdAt: queued.message.createdAt,
      })
      .then(() => {
        setQueuedSends((current) =>
          current.filter((candidate) => candidate.message.id !== queued.message.id)
        );
      })
      .catch((error: unknown) => {
        setQueuedSends((current) =>
          current.filter((candidate) => candidate.message.id !== queued.message.id)
        );
        setOptimisticMessages((current) =>
          current.filter((message) => message.id !== queued.message.id)
        );
        setSendError(error instanceof Error ? error.message : "Unable to send the queued prompt.");
      })
      .finally(() => setIsDispatching(false));
  }, [environmentId, getClient, isDispatching, queuedSends, state.data, targetKey, threadId]);

  const sendMessage = useCallback(
    async (text: string) => {
      const thread = state.data;
      if (!thread || !text.trim()) return;
      const createdAt = new Date().toISOString();
      const messageId = MessageId.make(newId());
      const optimistic: OptimisticMessage = {
        id: messageId,
        role: "user",
        text: text.trim(),
        attachments: [],
        turnId: null,
        streaming: false,
        createdAt,
        updatedAt: createdAt,
        optimistic: true,
      };
      setSendError(null);
      setOptimisticMessages((current) => [...current, optimistic]);
      setQueuedSends((current) => [
        ...current,
        {
          commandId: CommandId.make(newId()),
          message: optimistic,
          targetKey,
        },
      ]);
    },
    [state.data, targetKey]
  );
  const clearSendError = useCallback(() => setSendError(null), []);

  return {
    environmentId,
    threadId,
    shell,
    thread: state.data,
    messages,
    isPending: state.isPending,
    isCached: state.isCached,
    cachedReceivedAt: state.cachedReceivedAt,
    error: state.error,
    sendError,
    sendMessage,
    clearSendError,
  };
}