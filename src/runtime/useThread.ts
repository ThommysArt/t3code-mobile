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
import { useEnvironments } from "./EnvironmentProvider";

interface ThreadState {
  readonly data: OrchestrationThread | null;
  readonly isPending: boolean;
  readonly error: string | null;
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
  });
  const [optimisticMessages, setOptimisticMessages] = useState<readonly OptimisticMessage[]>([]);
  const [queuedSends, setQueuedSends] = useState<readonly QueuedSend[]>([]);
  const [isDispatching, setIsDispatching] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const targetKey = `${environmentId}:${threadId}`;
  const targetKeyRef = useRef(targetKey);

  useEffect(() => {
    if (targetKeyRef.current !== targetKey) {
      targetKeyRef.current = targetKey;
      setState({ data: null, isPending: true, error: null });
      setOptimisticMessages([]);
      setQueuedSends([]);
      setSendError(null);
    }

    const client = getClient(environmentId);
    if (!client) {
      setState((current) => ({ ...current, isPending: true }));
      return;
    }

    setState((current) => ({ ...current, isPending: true, error: null }));
    return client.orchestration.subscribeThread(
      { threadId },
      (item) => {
        if (item.kind === "snapshot") {
          setState({ data: item.snapshot.thread, isPending: false, error: null });
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
            return { data: result.thread, isPending: false, error: null };
          }
          if (result.kind === "deleted") {
            return { data: null, isPending: false, error: "Thread deleted." };
          }
          return current;
        });
      },
      {
        onResubscribe: () => setState((current) => ({ ...current, isPending: true, error: null })),
      }
    );
  }, [environment?.sessionRevision, environmentId, getClient, targetKey, threadId]);

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
    error: state.error,
    sendError,
    sendMessage,
    clearSendError,
  };
}
