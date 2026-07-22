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
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/AppIcon";
import { BlurScreenRoot, HeaderBubble, HeaderSpacer } from "@/components/chrome";
import { useChromeTheme } from "@/components/chrome/useChromeTheme";
import { FloatingBottomChrome } from "@/components/FloatingBottomChrome";
import { Screen } from "@/components/Screen";
import { estimatedSearchChromeHeight } from "@/utils/bottomChrome";
import { useEnvironments } from "@/runtime/EnvironmentProvider";
import { usePreferences } from "@/runtime/PreferencesProvider";
import { compareThreadsByInitiatedAt, getThreadInitiatedAt } from "@/runtime/catalog";
import { logStatus } from "@/runtime/statusLog";
import { relativeTime } from "@/utils/time";

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
        backgroundColor: isDark ? "#172554" : "#dbeafe",
        foregroundColor: isDark ? "#60a5fa" : "#1d4ed8",
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
      ? "#2563eb"
      : props.isDark
        ? "#a3a3a3"
        : "#737373";

  return (
    <Pressable onPress={props.onPress} style={({ pressed }) => ({ opacity: pressed ? 0.66 : 1 })}>
      <View
        style={{
          minHeight: 62,
          flexDirection: "row",
          gap: 9,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderBottomWidth: props.isLast ? 0 : 1,
          borderBottomColor: separator,
        }}
      >
        <View
          style={{
            width: 32,
            height: 32,
            marginTop: 1,
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
            backgroundColor:
              props.thread.session?.status === "running"
                ? "#362012"
                : props.isDark
                  ? "#242424"
                  : "#eeeeef",
          }}
        >
          <AppIcon name="branch" size={15} color={iconColor} strokeWidth={1.8} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Text
              style={{
                flex: 1,
                color: foreground,
                fontSize: 14,
                fontWeight: "700",
                lineHeight: 20,
              }}
              numberOfLines={1}
            >
              {props.thread.title}
            </Text>
            <View
              style={{
                borderRadius: 999,
                paddingHorizontal: 6,
                paddingVertical: 2,
                backgroundColor: tone.backgroundColor,
              }}
            >
              <Text style={{ color: tone.foregroundColor, fontSize: 10, fontWeight: "600" }}>
                {tone.label}
              </Text>
            </View>
            <Text style={{ width: 30, color: muted, fontSize: 11, textAlign: "right" }}>
              {relativeTime(getThreadInitiatedAt(props.thread))}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <AppIcon name="branch" size={11} color={muted} strokeWidth={1.7} />
            <Text
              style={{ flex: 1, color: muted, fontFamily: "monospace", fontSize: 11 }}
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
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const foreground = isDark ? "#f5f5f5" : "#171717";
  const muted = isDark ? "#858585" : "#737373";
  const surface = isDark ? "#171717" : "#ffffff";
  const border = isDark ? "#292929" : "#dedede";
  const background = isDark ? "#090909" : "#f4f4f5";
  const { environments, isBootstrapping, projects, reloadThreads, threads } = useEnvironments();
  const { preferences } = usePreferences();
  const collapsedThreadLimit = preferences.sidebarThreadPreviewCount;
  const [search, setSearch] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(new Set());
  const [bottomChromeHeight, setBottomChromeHeight] = useState(() =>
    estimatedSearchChromeHeight(insets)
  );
  const [headerHeight, setHeaderHeight] = useState(insets.top + 52);
  const theme = useChromeTheme();
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
          threads: groupThreads.sort(compareThreadsByInitiatedAt),
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
        const leftDate = left.threads[0] ? getThreadInitiatedAt(left.threads[0]) : "";
        const rightDate = right.threads[0] ? getThreadInitiatedAt(right.threads[0]) : "";
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
    <Screen edges={["left", "right"]}>
      <BlurScreenRoot
        onHeaderHeightChange={setHeaderHeight}
        header={
          <>
            <HeaderBubble variant="title">
              <View style={{ alignItems: "center", flexDirection: "row", gap: 8, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.foreground,
                    fontSize: 15,
                    fontWeight: "600",
                    lineHeight: 17,
                  }}
                >
                  T3 Code
                </Text>
                <View className="rounded-full bg-default px-2 py-0.5">
                  <Text className="text-[9px] font-bold uppercase tracking-[1px] text-muted">
                    Mobile
                  </Text>
                </View>
              </View>
            </HeaderBubble>
            <HeaderSpacer />
            <HeaderBubble
              accessibilityLabel="Open settings"
              onPress={() => router.push("/settings")}
              variant="icon"
            >
              <AppIcon name="settings" size={20} color={theme.foreground} />
            </HeaderBubble>
          </>
        }
        footer={
          <FloatingBottomChrome onHeightChange={setBottomChromeHeight}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              }}
            >
              <View
                style={{
                  height: 46,
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: border,
                  backgroundColor: surface,
                  paddingHorizontal: 12,
                }}
              >
                <AppIcon name="search" size={18} color={isDark ? "#d4d4d4" : "#525252"} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder="Search threads"
                  placeholderTextColor={isDark ? "#858585" : "#8a8a8a"}
                  returnKeyType="search"
                  style={{ flex: 1, color: foreground, fontSize: 14 }}
                />
              </View>
              <Pressable
                accessibilityLabel="Refresh threads"
                onPress={() => void reloadThreads()}
                style={({ pressed }) => ({
                  width: 46,
                  height: 46,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: border,
                  backgroundColor: surface,
                  opacity: pressed ? 0.66 : 1,
                })}
              >
                <AppIcon name="refresh" size={19} color={isDark ? "#f5f5f5" : "#262626"} />
              </Pressable>
            </View>
          </FloatingBottomChrome>
        }
      >
        <ScrollView
          onLayout={handleCatalogLayout}
          style={{ flex: 1, width: "100%", backgroundColor: background }}
          contentContainerStyle={{
            gap: 16,
            paddingHorizontal: 12,
            paddingTop: headerHeight + 2,
            paddingBottom: bottomChromeHeight + 8,
          }}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {environments.length > 0 ? (
            <View className="flex-row items-center gap-1.5">
              <View className="h-2 w-2 rounded-full" style={{ backgroundColor: connectionColor }} />
              <Text className="text-[11px] font-semibold text-muted">{connectionLabel}</Text>
              <Text className="text-[11px] text-muted">
                {threads.length} thread{threads.length === 1 ? "" : "s"}
              </Text>
              {isConnecting ? <ActivityIndicator size="small" color={connectionColor} /> : null}
            </View>
          ) : null}
          {isBootstrapping ? (
            <View className="items-center gap-3 rounded-3xl border border-border bg-surface px-5 py-10">
              <ActivityIndicator color="#2563eb" />
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
                onPress={() => router.push("/settings/server")}
                className="rounded-full bg-accent px-6 py-3"
              >
                <Text className="font-semibold text-accent-foreground">Add server</Text>
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
                : group.threads.slice(0, collapsedThreadLimit);
              const hiddenCount = group.threads.length - visibleThreads.length;
              return (
                <View key={group.key} style={{ gap: 7 }}>
                  <View
                    style={{
                      minHeight: 22,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 6,
                    }}
                  >
                    <AppIcon name="folder" size={14} color={muted} />
                    <Text
                      style={{
                        flex: 1,
                        color: muted,
                        fontSize: 12,
                        fontWeight: "700",
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                      }}
                      numberOfLines={1}
                    >
                      {group.title}
                    </Text>
                    {group.threads.length > collapsedThreadLimit ? (
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
                        <Text style={{ color: muted, fontSize: 11, fontWeight: "600" }}>
                          {isExpanded ? "Show less" : `${hiddenCount} more`}
                        </Text>
                      </Pressable>
                    ) : null}
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
                        className="h-6 w-6 items-center justify-center rounded-full bg-default"
                      >
                        <AppIcon name="plus" size={13} color={isDark ? "#d4d4d4" : "#525252"} />
                      </Pressable>
                    ) : null}
                  </View>
                  <View
                    style={{
                      overflow: "hidden",
                      borderRadius: 20,
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
      </BlurScreenRoot>
    </Screen>
  );
}
