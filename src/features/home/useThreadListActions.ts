import type { EnvironmentScopedThreadShell } from "@t3tools/client-runtime";
import { canSettle } from "@t3tools/client-runtime";
import {
  CommandId,
  type ClientOrchestrationCommand,
  type EnvironmentId,
} from "@t3tools/contracts";
import { useCallback, useRef } from "react";
import { Alert } from "react-native";

import { useEnvironments } from "@/runtime/EnvironmentProvider";
import { formatRemoteError } from "@/runtime/statusLog";
import { newId } from "@/utils/id";

function scopedThreadKey(environmentId: EnvironmentId, threadId: string): string {
  return `${environmentId}:${threadId}`;
}

function environmentSupportsSettlement(
  environments: ReturnType<typeof useEnvironments>["environments"],
  environmentId: EnvironmentId
): boolean {
  const environment = environments.find(
    (entry) => entry.connection.environmentId === environmentId
  );
  return environment?.serverConfig?.environment.capabilities.threadSettlement === true;
}

type ThreadListAction = "settle" | "unsettle";

function actionFailureTitle(action: ThreadListAction): string {
  return action === "settle" ? "Could not settle thread" : "Could not un-settle thread";
}

export function useThreadListActions(): {
  readonly settleThread: (thread: EnvironmentScopedThreadShell) => Promise<boolean>;
  readonly unsettleThread: (thread: EnvironmentScopedThreadShell) => Promise<boolean>;
  readonly environmentSupportsSettlement: (environmentId: EnvironmentId) => boolean;
} {
  const { dispatchCommand, environments, reloadThreads } = useEnvironments();
  const inFlightThreadKeys = useRef(new Set<string>());

  const supportsSettlement = useCallback(
    (environmentId: EnvironmentId) => environmentSupportsSettlement(environments, environmentId),
    [environments]
  );

  const executeAction = useCallback(
    async (action: ThreadListAction, thread: EnvironmentScopedThreadShell) => {
      const key = scopedThreadKey(thread.environmentId, thread.id);
      if (inFlightThreadKeys.current.has(key)) return false;

      inFlightThreadKeys.current.add(key);
      try {
        if (!supportsSettlement(thread.environmentId)) {
          Alert.alert(
            actionFailureTitle(action),
            "This environment's server does not support settling yet. Update the server to use Settle."
          );
          return false;
        }
        if (action === "settle" && !canSettle(thread, { now: new Date().toISOString() })) {
          Alert.alert(
            actionFailureTitle(action),
            "This thread still needs attention. Resolve or interrupt it first, then try again."
          );
          return false;
        }

        const commandId = CommandId.make(newId());
        const command: ClientOrchestrationCommand =
          action === "settle"
            ? { type: "thread.settle", commandId, threadId: thread.id }
            : {
                type: "thread.unsettle",
                commandId,
                threadId: thread.id,
                reason: "user",
              };

        try {
          await dispatchCommand(thread.environmentId, command);
          // Shell stream usually pushes the upsert; refresh as a safety net for
          // HTTP fallback and any lag between command accept and projection.
          void reloadThreads(thread.environmentId);
          return true;
        } catch (error) {
          Alert.alert(
            actionFailureTitle(action),
            formatRemoteError(error) ||
              `The thread could not be ${action === "settle" ? "settled" : "un-settled"}.`
          );
          return false;
        }
      } finally {
        inFlightThreadKeys.current.delete(key);
      }
    },
    [dispatchCommand, reloadThreads, supportsSettlement]
  );

  const settleThread = useCallback(
    async (thread: EnvironmentScopedThreadShell) => (await executeAction("settle", thread)) === true,
    [executeAction]
  );
  const unsettleThread = useCallback(
    async (thread: EnvironmentScopedThreadShell) =>
      (await executeAction("unsettle", thread)) === true,
    [executeAction]
  );

  return { settleThread, unsettleThread, environmentSupportsSettlement: supportsSettlement };
}
