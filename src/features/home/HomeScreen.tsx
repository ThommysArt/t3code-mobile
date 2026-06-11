import type {
  EnvironmentScopedProjectShell,
  EnvironmentScopedThreadShell,
} from "@t3tools/client-runtime";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
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
  const iconColor =
    props.thread.session?.status === "running" || props.thread.session?.status === "starting"
      ? "#f97316"
      : props.isDark
        ? "#a3a3a3"
        : "#737373";

  return (
    <Pressable onPress={props.onPress} style={({ pressed }) => ({ opacity: pressed ? 0.66 : 1 })}>
      <View
        className={`flex-row gap-3 px-4 py-3.5 ${props.isLast ? "" : "border-b border-separator"}`}
      >
        <View
          className="mt-0.5 h-10 w-10 items-center justify-center rounded-xl"
          style={{
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
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-2">
            <Text
              className="flex-1 text-[16px] font-bold leading-6 text-foreground"
              numberOfLines={1}
            >
              {props.thread.title}
            </Text>
            <View
              className="rounded-full px-2 py-1"
              style={{ backgroundColor: tone.backgroundColor }}
            >
              <Text className="text-[11px] font-semibold" style={{ color: tone.foregroundColor }}>
                {tone.label}
              </Text>
            </View>
            <Text className="w-8 text-right text-xs" style={{ color: muted }}>
              {relativeTime(props.thread.updatedAt ?? props.thread.createdAt)}
            </Text>
          </View>
          <View className="flex-row items-center gap-1.5">
            <AppIcon name="branch" size={12} color={muted} strokeWidth={1.7} />
            <Text className="flex-1 font-mono text-xs text-muted" numberOfLines={1}>
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
  const { environments, isBootstrapping, projects, reloadThreads, threads } = useEnvironments();
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(new Set());

  const groups = useMemo<readonly ProjectGroup[]>(() => {
    const query = search.trim().toLowerCase();
    const projectByKey = new Map(
      projects.map((project) => [scopedProjectKey(project.environmentId, project.id), project])
    );
    const grouped = new Map<string, EnvironmentScopedThreadShell[]>();

    for (const thread of threads) {
      const project = projectByKey.get(scopedProjectKey(thread.environmentId, thread.projectId));
      if (
        query &&
        !thread.title.toLowerCase().includes(query) &&
        !(thread.branch?.toLowerCase().includes(query) ?? false) &&
        !(project?.title.toLowerCase().includes(query) ?? false)
      ) {
        continue;
      }
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
  const connectionLabel =
    readyCount > 0 ? "Live" : hasHttpData ? "HTTP sync" : hasCachedData ? "Cached" : "Offline";
  const connectionColor =
    readyCount > 0 ? "#22c55e" : hasHttpData ? "#f59e0b" : isConnecting ? "#60a5fa" : "#737373";

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
        className="flex-1"
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
              <View key={group.key} className="gap-2.5">
                <View className="flex-row items-center gap-2 px-2">
                  <AppIcon name="folder" size={16} color={isDark ? "#858585" : "#737373"} />
                  <Text
                    className="flex-1 text-[13px] font-bold uppercase tracking-[0.8px] text-muted"
                    numberOfLines={1}
                  >
                    {group.title}
                  </Text>
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
                      <Text className="text-xs font-semibold text-muted">
                        {isExpanded ? "Show less" : `${hiddenCount} more`}
                      </Text>
                    </Pressable>
                  ) : (
                    <Text className="text-xs font-semibold text-muted">{group.threads.length}</Text>
                  )}
                </View>
                <View className="overflow-hidden rounded-[28px] border border-border bg-surface">
                  {visibleThreads.map((thread, index) => (
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
                  ))}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <View className="absolute bottom-0 left-0 right-0 flex-row items-center gap-3 bg-background px-5 pb-3 pt-2">
        <View className="h-14 flex-1 flex-row items-center gap-3 rounded-full border border-border bg-surface px-4">
          <AppIcon name="search" size={22} color={isDark ? "#d4d4d4" : "#525252"} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search threads"
            placeholderTextColor={isDark ? "#858585" : "#8a8a8a"}
            returnKeyType="search"
            className="flex-1 text-[16px] text-foreground"
          />
        </View>
        <Pressable
          accessibilityLabel="Refresh threads"
          onPress={() => void reloadThreads()}
          className="h-14 w-14 items-center justify-center rounded-full border border-border bg-surface"
        >
          <AppIcon name="refresh" size={23} color={isDark ? "#f5f5f5" : "#262626"} />
        </Pressable>
      </View>
    </Screen>
  );
}
