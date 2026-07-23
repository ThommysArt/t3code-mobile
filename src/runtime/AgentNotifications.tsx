import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";

import type { EnvironmentScopedThreadShell } from "@t3tools/client-runtime";
import {
  EnvironmentId,
  ThreadId,
  type GitStackedAction,
  type VcsStatusResult,
} from "@t3tools/contracts";

import { useEnvironments } from "./EnvironmentProvider";
import { logStatus } from "./statusLog";
import { newId } from "@/utils/id";

const LIVE_CHANNEL_ID = "agent-live";
const EVENTS_CHANNEL_ID = "agent-events";
const LIVE_NOTIFICATION_ID = "agent-live-running-threads";
const CATEGORY_COMPLETED_COMMIT_PUSH = "completedCommitPush";
const CATEGORY_COMPLETED_PUSH = "completedPush";
const CATEGORY_COMPLETED_PUSH_NEW_REF = "completedPushNewRef";
const CATEGORY_COMPLETED_PUSH_CHOICES = "completedPushChoices";
const ACTION_COMMIT_PUSH_NEW_REF = "commit_push_new_ref";
const ACTION_PUSH = "push";
const ACTION_PUSH_NEW_REF = "push_new_ref";

type ExpoNotificationsModule = typeof import("expo-notifications");
type NotificationContentInput = import("expo-notifications").NotificationContentInput;
type NotificationResponse = import("expo-notifications").NotificationResponse;

type NotificationPhase =
  | "starting"
  | "running"
  | "waiting_for_approval"
  | "waiting_for_input"
  | "completed"
  | "failed"
  | "interrupted";

interface ThreadNotificationState {
  readonly phase: NotificationPhase | null;
  readonly eventKey: string | null;
}

interface NotificationThread {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly projectId: EnvironmentScopedThreadShell["projectId"];
  readonly title: string;
  readonly worktreePath: string | null;
  readonly phase: NotificationPhase;
  readonly detail?: string;
  readonly eventKey: string;
  readonly updatedAt: string;
}

interface GitNotificationContext {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly cwd: string;
  readonly status: VcsStatusResult | null;
}

let notificationsModulePromise: Promise<ExpoNotificationsModule | null> | null = null;
let notificationSetupPromise: Promise<ExpoNotificationsModule | null> | null = null;
let notificationHandlerConfigured = false;
let liveNotificationVisible = false;

function shouldDisableNotificationsForRuntime(): boolean {
  return Platform.OS === "web" || (Platform.OS === "android" && Constants.appOwnership === "expo");
}

async function loadNotificationsModule(): Promise<ExpoNotificationsModule | null> {
  if (shouldDisableNotificationsForRuntime()) return null;
  notificationsModulePromise ??= import("expo-notifications").catch((error: unknown) => {
    logStatus(
      "app",
      "warning",
      "Notifications unavailable",
      error instanceof Error ? error.message : String(error),
      { toast: false }
    );
    return null;
  });
  return notificationsModulePromise;
}

function resolveNotificationPhase(thread: EnvironmentScopedThreadShell): NotificationPhase | null {
  if (thread.hasPendingApprovals) return "waiting_for_approval";
  if (thread.hasPendingUserInput) return "waiting_for_input";
  if (thread.session?.status === "error" || thread.latestTurn?.state === "error") return "failed";
  if (thread.session?.status === "starting") return "starting";
  if (thread.session?.status === "running" || thread.latestTurn?.state === "running") {
    return "running";
  }
  if (thread.latestTurn?.state === "completed") return "completed";
  if (thread.latestTurn?.state === "interrupted" || thread.session?.status === "interrupted") {
    return "interrupted";
  }
  return null;
}

function phaseDetail(
  thread: EnvironmentScopedThreadShell,
  phase: NotificationPhase
): string | undefined {
  if (phase === "failed") return thread.session?.lastError ?? undefined;
  if (phase === "running" && thread.session?.providerName) {
    return `${thread.session.providerName} is active.`;
  }
  return undefined;
}

function eventKeyForThread(
  thread: EnvironmentScopedThreadShell,
  phase: NotificationPhase | null
): string | null {
  if (phase === null) return null;
  const turnKey =
    thread.latestTurn?.turnId ??
    thread.session?.activeTurnId ??
    thread.latestTurn?.completedAt ??
    thread.updatedAt;
  return `${thread.environmentId}:${thread.id}:${phase}:${turnKey}`;
}

function toNotificationThread(thread: EnvironmentScopedThreadShell): NotificationThread | null {
  const phase = resolveNotificationPhase(thread);
  const eventKey = eventKeyForThread(thread, phase);
  if (phase === null || eventKey === null) return null;
  return {
    environmentId: thread.environmentId,
    threadId: thread.id,
    projectId: thread.projectId,
    title: thread.title,
    worktreePath: thread.worktreePath,
    phase,
    ...(phaseDetail(thread, phase) ? { detail: phaseDetail(thread, phase) } : {}),
    eventKey,
    updatedAt: thread.updatedAt,
  };
}

function notificationRouteData(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}): Record<string, unknown> {
  return {
    environmentId: input.environmentId,
    threadId: input.threadId,
  };
}

async function ensureNotificationsReady(): Promise<ExpoNotificationsModule | null> {
  notificationSetupPromise ??= (async () => {
    const Notifications = await loadNotificationsModule();
    if (!Notifications) return null;

    try {
      if (!notificationHandlerConfigured) {
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            priority: Notifications.AndroidNotificationPriority.DEFAULT,
          }),
        });
        notificationHandlerConfigured = true;
      }

      if (Platform.OS === "android") {
        await Promise.all([
          Notifications.setNotificationChannelAsync(LIVE_CHANNEL_ID, {
            name: "Running agents",
            description: "Persistent status for currently running T3 Code threads.",
            importance: Notifications.AndroidImportance.LOW,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
            showBadge: false,
            sound: null,
          }),
          Notifications.setNotificationChannelAsync(EVENTS_CHANNEL_ID, {
            name: "Agent updates",
            description: "Completed, failed, and action-needed T3 Code thread updates.",
            importance: Notifications.AndroidImportance.HIGH,
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
            showBadge: true,
            sound: "default",
            vibrationPattern: [0, 250, 250, 250],
          }),
        ]);
      }
      await registerNotificationCategories(Notifications);

      const existing = await Notifications.getPermissionsAsync();
      const permission = existing.granted
        ? existing
        : await Notifications.requestPermissionsAsync();
      return permission.granted ? Notifications : null;
    } catch (error) {
      logStatus(
        "app",
        "warning",
        "Notifications unavailable",
        error instanceof Error ? error.message : String(error),
        { toast: false }
      );
      return null;
    }
  })();
  return notificationSetupPromise;
}

async function registerNotificationCategories(
  Notifications: ExpoNotificationsModule
): Promise<void> {
  await Promise.all([
    Notifications.setNotificationCategoryAsync(CATEGORY_COMPLETED_COMMIT_PUSH, [
      {
        identifier: ACTION_COMMIT_PUSH_NEW_REF,
        buttonTitle: "Commit & Push",
        options: { opensAppToForeground: true, isAuthenticationRequired: true },
      },
    ]),
    Notifications.setNotificationCategoryAsync(CATEGORY_COMPLETED_PUSH, [
      {
        identifier: ACTION_PUSH,
        buttonTitle: "Push",
        options: { opensAppToForeground: true, isAuthenticationRequired: true },
      },
    ]),
    Notifications.setNotificationCategoryAsync(CATEGORY_COMPLETED_PUSH_NEW_REF, [
      {
        identifier: ACTION_PUSH_NEW_REF,
        buttonTitle: "Push New Ref",
        options: { opensAppToForeground: true, isAuthenticationRequired: true },
      },
    ]),
    Notifications.setNotificationCategoryAsync(CATEGORY_COMPLETED_PUSH_CHOICES, [
      {
        identifier: ACTION_PUSH,
        buttonTitle: "Push",
        options: { opensAppToForeground: true, isAuthenticationRequired: true },
      },
      {
        identifier: ACTION_PUSH_NEW_REF,
        buttonTitle: "Push New Ref",
        options: { opensAppToForeground: true, isAuthenticationRequired: true },
      },
    ]),
  ]);
}

function liveNotificationBody(threads: readonly NotificationThread[]): string {
  const names = threads.map((thread) => thread.title);
  const visible = names.slice(0, 5);
  const hiddenCount = names.length - visible.length;
  return hiddenCount > 0 ? `${visible.join("\n")}\n+${hiddenCount} more` : visible.join("\n");
}

async function updateLiveNotification(threads: readonly NotificationThread[]): Promise<void> {
  if (threads.length === 0) {
    if (liveNotificationVisible) {
      const Notifications = await loadNotificationsModule();
      await Notifications?.dismissNotificationAsync(LIVE_NOTIFICATION_ID).catch(() => undefined);
      liveNotificationVisible = false;
    }
    return;
  }

  const Notifications = await ensureNotificationsReady();
  if (!Notifications) return;

  await Notifications.dismissNotificationAsync(LIVE_NOTIFICATION_ID).catch(() => undefined);
  const title = threads.length === 1 ? "1 agent running" : `${threads.length} agents running`;
  const firstThread = threads[0];
  const url =
    threads.length === 1 && firstThread
      ? notificationRouteData({
          environmentId: firstThread.environmentId,
          threadId: firstThread.threadId,
        })
      : null;

  await Notifications.scheduleNotificationAsync({
    identifier: LIVE_NOTIFICATION_ID,
    content: {
      title,
      body: liveNotificationBody(threads),
      data: { ...url, kind: "agent-live" },
      sound: false,
      priority: Notifications.AndroidNotificationPriority.LOW,
      sticky: true,
      autoDismiss: false,
    },
    trigger: Platform.OS === "android" ? { channelId: LIVE_CHANNEL_ID } : null,
  });
  liveNotificationVisible = true;
}

function canPushStatus(status: VcsStatusResult): boolean {
  const hasBranch = status.refName !== null;
  const hasOriginOrUpstream = status.hasUpstream || status.hasPrimaryRemote;
  return hasBranch && status.aheadCount > 0 && status.behindCount === 0 && hasOriginOrUpstream;
}

function notificationCategoryForCompletedStatus(
  status: VcsStatusResult | null
): string | undefined {
  if (!status?.isRepo || status.refName === null || status.behindCount > 0) {
    return undefined;
  }

  if (status.hasWorkingTreeChanges && (status.hasUpstream || status.hasPrimaryRemote)) {
    return CATEGORY_COMPLETED_COMMIT_PUSH;
  }

  if (!canPushStatus(status)) {
    return undefined;
  }

  if (status.isDefaultRef) {
    return CATEGORY_COMPLETED_PUSH_NEW_REF;
  }

  return status.hasPrimaryRemote ? CATEGORY_COMPLETED_PUSH_CHOICES : CATEGORY_COMPLETED_PUSH;
}

function eventNotificationContent(
  thread: NotificationThread,
  gitContext?: GitNotificationContext | null
): NotificationContentInput | null {
  const routeData = notificationRouteData({
    environmentId: thread.environmentId,
    threadId: thread.threadId,
  });
  const base = {
    data: {
      ...routeData,
      kind: "agent-event",
      phase: thread.phase,
      eventKey: thread.eventKey,
      ...(gitContext ? { cwd: gitContext.cwd } : {}),
    },
    priority: "high",
    sticky: false,
    autoDismiss: true,
  };

  switch (thread.phase) {
    case "completed":
      return {
        ...base,
        title: "Agent finished",
        body: thread.title,
        categoryIdentifier: notificationCategoryForCompletedStatus(gitContext?.status ?? null),
      };
    case "failed":
      return {
        ...base,
        title: "Agent failed",
        body: thread.detail ?? thread.title,
      };
    case "waiting_for_approval":
      return {
        ...base,
        title: "Approval needed",
        body: thread.title,
      };
    case "waiting_for_input":
      return {
        ...base,
        title: "Waiting for input",
        body: thread.title,
      };
    default:
      return null;
  }
}

async function showEventNotification(
  thread: NotificationThread,
  gitContext?: GitNotificationContext | null
): Promise<void> {
  const content = eventNotificationContent(thread, gitContext);
  if (!content) return;
  const Notifications = await ensureNotificationsReady();
  if (!Notifications) return;

  await Notifications.scheduleNotificationAsync({
    identifier: `agent-event-${thread.eventKey}`,
    content,
    trigger: Platform.OS === "android" ? { channelId: EVENTS_CHANNEL_ID } : null,
  });
}

export function AgentNotifications() {
  const router = useRouter();
  const { getClient, projects, threads } = useEnvironments();
  const previousStateRef = useRef<Map<string, ThreadNotificationState> | null>(null);
  const notifiedEventKeysRef = useRef(new Set<string>());
  const gitContextByEventKeyRef = useRef(new Map<string, GitNotificationContext>());
  const handledNotificationResponsesRef = useRef(new Set<string>());

  const notificationThreads = useMemo(
    () =>
      threads
        .map(toNotificationThread)
        .filter((thread): thread is NotificationThread => thread !== null),
    [threads]
  );

  const findThreadCwd = useCallback(
    (thread: Pick<NotificationThread, "environmentId" | "projectId" | "worktreePath">) => {
      if (thread.worktreePath) return thread.worktreePath;
      return (
        projects.find(
          (project) =>
            project.environmentId === thread.environmentId && project.id === thread.projectId
        )?.workspaceRoot ?? null
      );
    },
    [projects]
  );

  const resolveGitContext = useCallback(
    async (thread: NotificationThread): Promise<GitNotificationContext | null> => {
      const cwd = findThreadCwd(thread);
      if (!cwd) return null;
      const client = getClient(thread.environmentId);
      if (!client) {
        return {
          environmentId: thread.environmentId,
          threadId: thread.threadId,
          cwd,
          status: null,
        };
      }

      const status = await client.vcs.refreshStatus({ cwd }).catch(() => null);
      return {
        environmentId: thread.environmentId,
        threadId: thread.threadId,
        cwd,
        status,
      };
    },
    [findThreadCwd, getClient]
  );

  const openThreadGit = useCallback(
    (environmentId: string, threadId: string) => {
      router.push({
        pathname: "/threads/[environmentId]/[threadId]/git",
        params: { environmentId, threadId },
      });
    },
    [router]
  );

  const resolveResponseGitContext = useCallback(
    async (data: Record<string, unknown> | undefined): Promise<GitNotificationContext | null> => {
      const eventKey = data?.eventKey;
      const environmentId = data?.environmentId;
      const threadId = data?.threadId;
      const cached =
        typeof eventKey === "string" ? gitContextByEventKeyRef.current.get(eventKey) : null;
      const cwd = typeof data?.cwd === "string" ? data.cwd : cached?.cwd;
      if (typeof environmentId !== "string" || typeof threadId !== "string" || !cwd) {
        return null;
      }

      const client = getClient(EnvironmentId.make(environmentId));
      if (!client) {
        return {
          environmentId: EnvironmentId.make(environmentId),
          threadId: ThreadId.make(threadId),
          cwd,
          status: cached?.status ?? null,
        };
      }

      const status = await client.vcs.refreshStatus({ cwd }).catch(() => cached?.status ?? null);
      return {
        environmentId: EnvironmentId.make(environmentId),
        threadId: ThreadId.make(threadId),
        cwd,
        status,
      };
    },
    [getClient]
  );

  const runNotificationGitAction = useCallback(
    async (actionIdentifier: string, data: Record<string, unknown> | undefined) => {
      const context = await resolveResponseGitContext(data);
      const environmentId = data?.environmentId;
      const threadId = data?.threadId;
      if (!context) {
        if (typeof environmentId === "string" && typeof threadId === "string") {
          openThreadGit(environmentId, threadId);
        }
        return;
      }

      const client = getClient(context.environmentId);
      if (!client) {
        logStatus(
          "git",
          "danger",
          "Live connection required",
          "Reconnect before running Git actions.",
          {
            environmentId: context.environmentId,
          }
        );
        openThreadGit(context.environmentId, context.threadId);
        return;
      }

      const status = context.status;
      if (!status?.isRepo || status.refName === null || status.behindCount > 0) {
        logStatus(
          "git",
          "danger",
          "Git action unavailable",
          "Refresh source control before running this action.",
          { environmentId: context.environmentId }
        );
        openThreadGit(context.environmentId, context.threadId);
        return;
      }

      let action: GitStackedAction;
      let featureBranch = false;
      if (actionIdentifier === ACTION_COMMIT_PUSH_NEW_REF) {
        action = "commit_push";
        featureBranch = true;
      } else if (actionIdentifier === ACTION_PUSH_NEW_REF) {
        action = "commit_push";
        featureBranch = true;
      } else if (actionIdentifier === ACTION_PUSH) {
        action = "push";
      } else {
        return;
      }

      if (action === "push" && !canPushStatus(status)) {
        logStatus("git", "danger", "Push unavailable", "Refresh source control before pushing.", {
          environmentId: context.environmentId,
        });
        openThreadGit(context.environmentId, context.threadId);
        return;
      }

      if (featureBranch && !(status.hasPrimaryRemote || status.hasUpstream)) {
        logStatus(
          "git",
          "danger",
          "Push unavailable",
          'Add an "origin" remote before pushing to a new ref.',
          { environmentId: context.environmentId }
        );
        openThreadGit(context.environmentId, context.threadId);
        return;
      }

      logStatus("git", "info", "Notification Git action started", action, {
        environmentId: context.environmentId,
        phase: "syncing",
        inProgress: true,
        toast: false,
      });

      try {
        const result = await client.git.runStackedAction({
          cwd: context.cwd,
          actionId: newId(),
          action,
          ...(featureBranch ? { featureBranch: true } : {}),
        });
        logStatus("git", "success", result.toast.title, result.toast.description, {
          environmentId: context.environmentId,
          inProgress: false,
          toast: true,
        });
      } catch (error) {
        logStatus(
          "git",
          "danger",
          "Notification Git action failed",
          error instanceof Error ? error.message : String(error),
          {
            environmentId: context.environmentId,
            phase: "error",
            inProgress: false,
          }
        );
      }
    },
    [getClient, openThreadGit, resolveResponseGitContext]
  );

  const handleNotificationResponse = useCallback(
    (response: NotificationResponse) => {
      const responseKey = `${response.notification.request.identifier}:${response.actionIdentifier}:${response.notification.date}`;
      if (handledNotificationResponsesRef.current.has(responseKey)) {
        return;
      }
      handledNotificationResponsesRef.current.add(responseKey);

      const data = response.notification.request.content.data;
      if (
        response.actionIdentifier === ACTION_COMMIT_PUSH_NEW_REF ||
        response.actionIdentifier === ACTION_PUSH_NEW_REF ||
        response.actionIdentifier === ACTION_PUSH
      ) {
        void runNotificationGitAction(response.actionIdentifier, data);
        return;
      }
      const environmentId = data?.environmentId;
      const threadId = data?.threadId;
      if (typeof environmentId === "string" && typeof threadId === "string") {
        router.push({
          pathname: "/threads/[environmentId]/[threadId]",
          params: { environmentId, threadId },
        });
        return;
      }
      router.push("/");
    },
    [router, runNotificationGitAction]
  );

  useEffect(() => {
    let subscription: { remove: () => void } | null = null;
    let cancelled = false;

    void loadNotificationsModule().then((Notifications) => {
      if (!Notifications || cancelled) return;
      subscription = Notifications.addNotificationResponseReceivedListener(
        handleNotificationResponse
      );
      const lastResponse = Notifications.getLastNotificationResponse?.();
      if (lastResponse) {
        handleNotificationResponse(lastResponse);
      }
    });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [handleNotificationResponse]);

  useEffect(() => {
    const runningThreads = notificationThreads.filter(
      (thread) => thread.phase === "running" || thread.phase === "starting"
    );
    void updateLiveNotification(runningThreads).catch((error: unknown) => {
      logStatus(
        "app",
        "warning",
        "Could not update live notification",
        error instanceof Error ? error.message : String(error),
        { toast: false }
      );
    });
  }, [notificationThreads]);

  useEffect(() => {
    const nextState = new Map<string, ThreadNotificationState>();
    const previousState = previousStateRef.current;

    for (const thread of notificationThreads) {
      const key = `${thread.environmentId}:${thread.threadId}`;
      nextState.set(key, { phase: thread.phase, eventKey: thread.eventKey });

      if (previousState === null) {
        notifiedEventKeysRef.current.add(thread.eventKey);
        continue;
      }

      const previous = previousState.get(key);
      const phaseChanged = previous?.phase !== thread.phase;
      const eventChanged = previous?.eventKey !== thread.eventKey;
      if ((!phaseChanged && !eventChanged) || notifiedEventKeysRef.current.has(thread.eventKey)) {
        continue;
      }

      notifiedEventKeysRef.current.add(thread.eventKey);
      void (async () => {
        const gitContext = thread.phase === "completed" ? await resolveGitContext(thread) : null;
        if (gitContext) {
          gitContextByEventKeyRef.current.set(thread.eventKey, gitContext);
        }
        await showEventNotification(thread, gitContext);
      })().catch((error: unknown) => {
        logStatus(
          "app",
          "warning",
          "Could not show agent notification",
          error instanceof Error ? error.message : String(error),
          { toast: false }
        );
      });
    }

    previousStateRef.current = nextState;
  }, [notificationThreads, resolveGitContext]);

  return null;
}
