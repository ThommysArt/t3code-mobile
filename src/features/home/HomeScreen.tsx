import type {
  EnvironmentScopedProjectShell,
  EnvironmentScopedThreadShell,
} from "@t3tools/client-runtime";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";

import { AppIcon } from "@/components/AppIcon";
import { Screen } from "@/components/Screen";
import { useEnvironments } from "@/runtime/EnvironmentProvider";
import { logStatus } from "@/runtime/statusLog";
import { relativeTime } from "@/utils/time";

const COLLAPSED_THREAD_LIMIT = 6;

interface ProjectGroup {
  readonly key: string;
  readonly project: EnvironmentScopedProjectShell | null;
  readonly title: string;
  readonly threads: readonly EnvironmentScopedThreadShell[];
}

function scopedProjectKey(environmentId: string, projectId: string): string {
  return `${environmentId}:${projectId}`;
}

function connectionStepLabel(step: string): string {
  switch (step) {
    case "checking-server":
      return "Checking server";
    case "validating-session":
      return "Validating session";
    case "opening-websocket":
      return "Opening WebSocket";
    case "syncing-threads":
      return "Syncing threads";
    case "refreshing-http":
      return "Refreshing";
    case "http-ready":
      return "HTTP sync";
    default:
      return "Offline";
  }
}

function statusTone(
  thread: EnvironmentScopedThreadShell,
  isDark: boolean
): {
  readonly label: string;
  readonly backgroundColor: string;
  readonly foregroundColor: string;
} {
  switch (thread.session?.status) {
    case "running":
      return {
        label: "Running",
        backgroundColor: isDark ? "#3b210f" : "#ffedd5",
        foregroundColor: isDark ? "#fb923c" : "#c2410c",
      };
    case "starting":
      return {
        label: "Starting",
        backgroundColor: isDark ? "#172554" : "#dbeafe",
        foregroundColor: isDark ? "#93c5fd" : "#1d4ed8",
      };
    case "ready":
      return {
        label: "Ready",
        backgroundColor: isDark ? "#12301f" : "#dcfce7",
        foregroundColor: isDark ? "#4ade80" : "#15803d",
      };
    case "error":
      return {
        label: "Error",
        backgroundColor: isDark ? "#3a1717" : "#fee2e2",
        foregroundColor: isDark ? "#f87171" : "#b91c1c",
      };
    default:
      return {
        label: "Idle",
        backgroundColor: isDark ? "#282828" : "#e5e5e5",
        foregroundColor: isDark ? "#d4d4d4" : "#525252",
      };
  }
}

function ThreadRow(props: {
  readonly thread: EnvironmentScopedThreadShell;
  readonly isLast: boolean;
  readonly onPress: () => void;
  readonly isDark: boolean;
}) {
  const tone = statusTone(props.thread, props.isDark);
  const muted = props.isDark ? "#737373" : "#737373";
  const foreground = props.isDark ? "#f5f5f5" : "#171717";
  const separator = props.isDark ? "#282828" : "#dedede";
  const iconColor =
    props.thread.session?.status === "running" || props.thread.session?.status === "starting"
      ? "#f97316"
      : props.isDark
        ? "#a3a3a3"
        : "#737373";

  return (
    <Pressable onPress={props.onPress} style={({ pressed }) => ({ opacity: pressed ? 0.66 : 1 })}>
      <View
        style={{
          minHeight: 76,
          flexDirection: "row",
          gap: 12,
          paddingHorizontal: 16,
          paddingVertical: 14,
          borderBottomWidth: props.isLast ? 0 : 1,
          borderBottomColor: separator,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            marginTop: 2,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 12,
            backgroundColor:
              props.thread.session?.status === "running"
                ? "#362012"
                : props.isDark
                  ? "#242424"
                  : "#eeeeef",
          }}
        >
          <AppIcon name="branch" size={18} color={iconColor} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              style={{
                flex: 1,
                color: foreground,
                fontSize: 16,
                fontWeight: "700",
                lineHeight: 24,
              }}
              numberOfLines={1}
            >
              {props.thread.title}
            </Text>
            <View
              style={{
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 4,
                backgroundColor: tone.backgroundColor,
              }}
            >
              <Text style={{ color: tone.foregroundColor, fontSize: 11, fontWeight: "600" }}>
                {tone.label}
              </Text>
            </View>
            <Text style={{ width: 34, color: muted, fontSize: 12, textAlign: "right" }}>
              {relativeTime(props.thread.updatedAt ?? props.thread.createdAt)}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <AppIcon name="branch" size={12} color={muted} strokeWidth={1.7} />
            <Text
              style={{ flex: 1, color: muted, fontFamily: "monospace", fontSize: 12 }}
              numberOfLines={1}
            >
              {props.thread.branch ?? "main"}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function HomeScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === "dark";
  const foreground = isDark ? "#f5f5f5" : "#171717";
  const muted = isDark ? "#858585" : "#737373";
  const surface = isDark ? "#171717" : "#ffffff";
  const border = isDark ? "#292929" : "#dedede";
  const background = isDark ? "#090909" : "#f4f4f5";
  const { environments, isBootstrapping, projects, reloadThreads, threads } = useEnvironments();
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(new Set());
  const hasLoggedViewportRef = useRef(false);

  const groups = useMemo<readonly ProjectGroup[]>(() => {
    const query = search.trim().toLowerCase();
    const projectByKey = new Map(
      projects.map((project) => [scopedProjectKey(project.environmentId, project.id), project])
    );
    const grouped = new Map<string, EnvironmentScopedThreadShell[]>(
      projects.map((project) => [
        scopedProjectKey(project.environmentId, project.id),
        [] as EnvironmentScopedThreadShell[],
      ])
    );

    for (const thread of threads) {
      const key = scopedProjectKey(thread.environmentId, thread.projectId);
      const existing = grouped.get(key);
      if (existing) existing.push(thread);
      else grouped.set(key, [thread]);
    }

    return [...grouped.entries()]
      .map(([key, groupThreads]) => {
        const project = projectByKey.get(key) ?? null;
        return {
          key,
          project,
          title: project?.title ?? "Unassigned",
          threads: groupThreads.sort((left, right) =>
            (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt)
          ),
        };
      })
      .filter(
        (group) =>
          !query ||
          group.title.toLowerCase().includes(query) ||
          group.threads.some(
            (thread) =>
              thread.title.toLowerCase().includes(query) ||
              (thread.branch?.toLowerCase().includes(query) ?? false)
          )
      )
      .sort((left, right) => {
        const leftDate = left.threads[0]?.updatedAt ?? left.threads[0]?.createdAt ?? "";
        const rightDate = right.threads[0]?.updatedAt ?? right.threads[0]?.createdAt ?? "";
        return rightDate.localeCompare(leftDate);
      });
  }, [projects, search, threads]);

  const readyCount = environments.filter(
    (environment) => environment.connectionState === "ready"
  ).length;
  const hasHttpData = environments.some((environment) => environment.dataSource === "http");
  const hasCachedData = environments.some((environment) => environment.dataSource === "cache");
  const isConnecting = environments.some(
    (environment) =>
      environment.connectionState === "connecting" || environment.connectionState === "reconnecting"
  );
  const activeStep = environments.find(
    (environment) => environment.connectionState !== "ready"
  )?.connectionStep;
  const connectionLabel =
    readyCount > 0
      ? "Live"
      : activeStep && activeStep !== "offline"
        ? connectionStepLabel(activeStep)
        : hasHttpData
          ? "HTTP sync"
          : hasCachedData
            ? "Cached"
            : "Offline";
  const connectionColor =
    readyCount > 0 ? "#22c55e" : hasHttpData ? "#f59e0b" : isConnecting ? "#60a5fa" : "#737373";

  useEffect(() => {
    if (environments.length === 0) return;
    logStatus(
      "shell",
      "success",
      "Home catalog updated",
      `${threads.length} visible threads in ${groups.length} project groups`,
      { toast: false }
    );
  }, [environments.length, groups.length, threads.length]);

  const handleCatalogLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (groups.length === 0 || hasLoggedViewportRef.current) return;
      hasLoggedViewportRef.current = true;
      const { height, width } = event.nativeEvent.layout;
      logStatus(
        "shell",
        height > 0 && width > 0 ? "success" : "danger",
        "Thread list viewport ready",
        `${Math.round(width)}x${Math.round(height)} for ${groups.length} project groups`,
        { toast: false }
      );
    },
    [groups.length]
  );

  return (
    <Screen>
      <View className="flex-row items-center justify-between px-5 pb-4 pt-3">
        <View className="flex-row items-center gap-3">
          <Text className="text-[28px] font-bold tracking-tight text-foreground">T3 Code</Text>
          <View className="rounded-full bg-default px-2.5 py-1">
            <Text className="text-[10px] font-bold uppercase tracking-[1.5px] text-muted">
              Mobile
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityLabel="Open environment settings"
          onPress={() => router.push("/connections")}
          className="h-12 w-12 items-center justify-center rounded-full border border-border bg-surface"
        >
          <AppIcon name="settings" size={24} color={isDark ? "#f5f5f5" : "#262626"} />
        </Pressable>
      </View>

      {environments.length > 0 ? (
        <View className="mx-5 mb-2 flex-row items-center gap-2">
          <View className="h-2 w-2 rounded-full" style={{ backgroundColor: connectionColor }} />
          <Text className="text-xs font-semibold text-muted">{connectionLabel}</Text>
          <Text className="text-xs text-muted">
            {threads.length} thread{threads.length === 1 ? "" : "s"}
          </Text>
          {isConnecting ? <ActivityIndicator size="small" color={connectionColor} /> : null}
        </View>
      ) : null}

      <ScrollView
        onLayout={handleCatalogLayout}
        style={{ flex: 1, width: "100%", backgroundColor: background }}
        contentContainerStyle={{
          gap: 24,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 112,
        }}
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {isBootstrapping ? (
          <View className="items-center gap-3 rounded-3xl border border-border bg-surface px-5 py-10">
            <ActivityIndicator color="#f97316" />
            <Text className="text-sm text-muted">Restoring environments and cached threads</Text>
          </View>
        ) : environments.length === 0 ? (
          <View className="items-center gap-4 rounded-3xl border border-border bg-surface px-6 py-12">
            <View className="h-14 w-14 items-center justify-center rounded-2xl bg-default">
              <AppIcon name="wifi" size={27} color={isDark ? "#d4d4d4" : "#525252"} />
            </View>
            <View className="items-center gap-2">
              <Text className="text-lg font-bold text-foreground">Connect your T3 server</Text>
              <Text className="text-center text-sm leading-6 text-muted">
                Pair with the Tailscale or local server URL to sync projects and threads.
              </Text>
            </View>
            <Pressable
              onPress={() => router.push("/connections")}
              className="rounded-full bg-accent px-6 py-3"
            >
              <Text className="font-semibold text-accent-foreground">Add environment</Text>
            </Pressable>
          </View>
        ) : groups.length === 0 ? (
          <View className="items-center gap-3 rounded-3xl border border-border bg-surface px-6 py-10">
            <Text className="text-lg font-bold text-foreground">
              {search.trim() ? "No matching threads" : "No threads found"}
            </Text>
            <Text className="text-center text-sm leading-6 text-muted">
              {search.trim()
                ? "Try a thread title, project, or branch name."
                : "Refresh the environment or create a thread from another T3 Code client."}
            </Text>
            {!search.trim() ? (
              <Pressable
                onPress={() => void reloadThreads()}
                className="flex-row items-center gap-2 rounded-full bg-default px-4 py-2.5"
              >
                <AppIcon name="refresh" size={16} color={isDark ? "#f5f5f5" : "#262626"} />
                <Text className="text-sm font-semibold text-foreground">Refresh</Text>
              </Pressable>
            ) : null}
          </View>
        ) : (
          groups.map((group) => {
            const isExpanded = expandedGroups.has(group.key);
            const visibleThreads = isExpanded
              ? group.threads
              : group.threads.slice(0, COLLAPSED_THREAD_LIMIT);
            const hiddenCount = group.threads.length - visibleThreads.length;
            return (
              <View key={group.key} style={{ gap: 10 }}>
                <View
                  style={{
                    minHeight: 24,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    paddingHorizontal: 8,
                  }}
                >
                  <AppIcon name="folder" size={16} color={muted} />
                  <Text
                    style={{
                      flex: 1,
                      color: muted,
                      fontSize: 13,
                      fontWeight: "700",
                      letterSpacing: 0.8,
                      textTransform: "uppercase",
                    }}
                    numberOfLines={1}
                  >
                    {group.title}
                  </Text>
                  <Text style={{ color: muted, fontSize: 12, fontWeight: "600" }}>
                    {group.threads.length}
                  </Text>
                  {group.project ? (
                    <Pressable
                      accessibilityLabel={`Create thread in ${group.title}`}
                      hitSlop={8}
                      onPress={() =>
                        router.push({
                          pathname: "/projects/[environmentId]/[projectId]/new-thread",
                          params: {
                            environmentId: group.project!.environmentId,
                            projectId: group.project!.id,
                          },
                        })
                      }
                      className="h-7 w-7 items-center justify-center rounded-full bg-default"
                    >
                      <AppIcon name="plus" size={15} color={isDark ? "#d4d4d4" : "#525252"} />
                    </Pressable>
                  ) : null}
                  {group.threads.length > COLLAPSED_THREAD_LIMIT ? (
                    <Pressable
                      hitSlop={10}
                      onPress={() =>
                        setExpandedGroups((current) => {
                          const next = new Set(current);
                          if (next.has(group.key)) next.delete(group.key);
                          else next.add(group.key);
                          return next;
                        })
                      }
                    >
                      <Text style={{ color: muted, fontSize: 12, fontWeight: "600" }}>
                        {isExpanded ? "Show less" : `${hiddenCount} more`}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <View
                  style={{
                    overflow: "hidden",
                    borderRadius: 28,
                    borderWidth: 1,
                    borderColor: border,
                    backgroundColor: surface,
                  }}
                >
                  {visibleThreads.length > 0 ? (
                    visibleThreads.map((thread, index) => (
                      <ThreadRow
                        key={`${thread.environmentId}:${thread.id}`}
                        thread={thread}
                        isDark={isDark}
                        isLast={index === visibleThreads.length - 1}
                        onPress={() =>
                          router.push({
                            pathname: "/threads/[environmentId]/[threadId]",
                            params: {
                              environmentId: thread.environmentId,
                              threadId: thread.id,
                            },
                          })
                        }
                      />
                    ))
                  ) : (
                    <Text className="px-4 py-5 text-sm text-muted">No threads yet</Text>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          left: 0,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 12,
          backgroundColor: background,
        }}
      >
        <View
          style={{
            height: 56,
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: border,
            backgroundColor: surface,
            paddingHorizontal: 16,
          }}
        >
          <AppIcon name="search" size={22} color={isDark ? "#d4d4d4" : "#525252"} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search threads"
            placeholderTextColor={isDark ? "#858585" : "#8a8a8a"}
            returnKeyType="search"
            style={{ flex: 1, color: foreground, fontSize: 16 }}
          />
        </View>
        <Pressable
          accessibilityLabel="Refresh threads"
          onPress={() => void reloadThreads()}
          style={({ pressed }) => ({
            width: 56,
            height: 56,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 999,
            borderWidth: 1,
            borderColor: border,
            backgroundColor: surface,
            opacity: pressed ? 0.66 : 1,
          })}
        >
          <AppIcon name="refresh" size={23} color={isDark ? "#f5f5f5" : "#262626"} />
        </Pressable>
      </View>
    </Screen>
  );
}
