import type { EnvironmentScopedThreadShell } from "@t3tools/client-runtime";
import type { EnvironmentId, VcsStatusResult } from "@t3tools/contracts";
import { resolveChangeRequestPresentation } from "@t3tools/shared/sourceControl";
import { useEffect, useMemo, useState } from "react";

import { useEnvironments } from "./EnvironmentProvider";

export type ThreadPr = NonNullable<VcsStatusResult["pr"]>;

export interface ThreadPrPresentation {
  readonly number: number;
  readonly state: ThreadPr["state"];
  readonly url: string;
  /** Compact PR number label, e.g. "2". */
  readonly label: string;
  readonly accessibilityLabel: string;
  readonly color: string;
}

const PR_STATE_COLOR: Record<ThreadPr["state"], { dark: string; light: string }> = {
  open: { dark: "#34d399", light: "#059669" },
  merged: { dark: "#a78bfa", light: "#7c3aed" },
  closed: { dark: "#a1a1aa", light: "#71717a" },
};

export function presentThreadPr(
  pr: ThreadPr,
  provider: VcsStatusResult["sourceControlProvider"] | null | undefined,
  isDark: boolean
): ThreadPrPresentation {
  const presentation = resolveChangeRequestPresentation(provider);
  const palette = PR_STATE_COLOR[pr.state];
  return {
    number: pr.number,
    state: pr.state,
    url: pr.url,
    label: String(pr.number),
    accessibilityLabel: `#${pr.number} ${presentation.longName} ${pr.state}`,
    color: isDark ? palette.dark : palette.light,
  };
}

type StatusListener = (status: VcsStatusResult | null) => void;

interface SharedVcsSubscription {
  readonly listeners: Set<StatusListener>;
  unsubscribe: (() => void) | null;
  status: VcsStatusResult | null;
}

const sharedVcsSubscriptions = new Map<string, SharedVcsSubscription>();

function subscriptionKey(environmentId: EnvironmentId, cwd: string): string {
  return `${environmentId}:${cwd}`;
}

/**
 * Live PR status for a thread's branch. Subscriptions are ref-counted and
 * shared per (environmentId, cwd) so many rows on the same worktree share one
 * VCS stream.
 */
export function useThreadPr(
  thread: EnvironmentScopedThreadShell,
  projectCwd: string | null,
  isDark: boolean
): ThreadPrPresentation | null {
  const { getClient, getEnvironment } = useEnvironments();
  const cwd = thread.worktreePath ?? projectCwd;
  const environment = getEnvironment(thread.environmentId);
  const [status, setStatus] = useState<VcsStatusResult | null>(null);

  useEffect(() => {
    if (!cwd || thread.branch === null) {
      setStatus(null);
      return;
    }

    const client = getClient(thread.environmentId);
    if (!client) {
      setStatus(null);
      return;
    }

    const key = subscriptionKey(thread.environmentId, cwd);
    let shared = sharedVcsSubscriptions.get(key);
    if (!shared) {
      shared = { listeners: new Set(), unsubscribe: null, status: null };
      sharedVcsSubscriptions.set(key, shared);
      const entry = shared;
      entry.unsubscribe = client.vcs.onStatus(
        { cwd },
        (next) => {
          entry.status = next;
          for (const listener of entry.listeners) listener(next);
        },
        {
          onResubscribe: () => {
            // Keep last known status until the next snapshot arrives.
          },
        }
      );
      void client.vcs.refreshStatus({ cwd }).then(
        (next) => {
          entry.status = next;
          for (const listener of entry.listeners) listener(next);
        },
        () => {
          // Ignore refresh failures; stream may still deliver later.
        }
      );
    }

    const listener: StatusListener = (next) => setStatus(next);
    shared.listeners.add(listener);
    setStatus(shared.status);

    return () => {
      const current = sharedVcsSubscriptions.get(key);
      if (!current) return;
      current.listeners.delete(listener);
      if (current.listeners.size === 0) {
        current.unsubscribe?.();
        sharedVcsSubscriptions.delete(key);
      }
    };
  }, [cwd, environment?.sessionRevision, getClient, thread.branch, thread.environmentId]);

  return useMemo(() => {
    if (!status || thread.branch === null || status.refName !== thread.branch) {
      return null;
    }
    if (!status.pr) return null;
    return presentThreadPr(status.pr, status.sourceControlProvider, isDark);
  }, [isDark, status, thread.branch]);
}
