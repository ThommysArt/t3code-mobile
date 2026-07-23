import type {
  EnvironmentScopedProjectShell,
  EnvironmentScopedThreadShell,
} from "@t3tools/client-runtime";
import { memo, useCallback } from "react";
import { Alert, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";

import { AppIcon } from "@/components/AppIcon";
import { GEIST_MONO } from "@/theme/fonts";
import { relativeTime } from "@/utils/time";

import { resolveThreadListV2Status, type ThreadListV2Status } from "./threadListV2";

const STATUS_META: Partial<
  Record<ThreadListV2Status, { label: string; dark: string; light: string }>
> = {
  approval: { label: "Approval", dark: "#fbbf24", light: "#b45309" },
  input: { label: "Input", dark: "#a5b4fc", light: "#4338ca" },
  working: { label: "Working", dark: "#38bdf8", light: "#0284c7" },
  failed: { label: "Failed", dark: "#f87171", light: "#b91c1c" },
};

function threadTimeLabel(thread: EnvironmentScopedThreadShell): string {
  return relativeTime(thread.latestUserMessageAt ?? thread.updatedAt ?? thread.createdAt);
}

export const ThreadListV2SettledDivider = memo(function ThreadListV2SettledDivider(props: {
  readonly isDark: boolean;
}) {
  const muted = props.isDark ? "#737373" : "#737373";
  const border = props.isDark ? "#1f1f1f" : "#e8e8ea";
  return (
    <View
      style={{
        marginTop: 14,
        marginBottom: 4,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingHorizontal: 6,
      }}
    >
      <Text style={{ color: muted, fontSize: 11, fontWeight: "600", letterSpacing: 0.6 }}>
        Settled
      </Text>
      <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: border }} />
    </View>
  );
});

export const ThreadListV2Row = memo(function ThreadListV2Row(props: {
  readonly thread: EnvironmentScopedThreadShell;
  readonly variant: "card" | "slim";
  readonly showSettledDivider: boolean;
  readonly project: EnvironmentScopedProjectShell | null;
  readonly environmentLabel: string | null;
  readonly settlementSupported: boolean;
  readonly onSelectThread: (thread: EnvironmentScopedThreadShell) => void;
  readonly onSettleThread: (thread: EnvironmentScopedThreadShell) => void;
  readonly onUnsettleThread: (thread: EnvironmentScopedThreadShell) => void;
}) {
  const isDark = useColorScheme() === "dark";
  const {
    thread,
    variant,
    project,
    environmentLabel,
    settlementSupported,
    onSelectThread,
    onSettleThread,
    onUnsettleThread,
  } = props;

  // Keep cards close to the screen so the list reads as one surface, not a stack of tiles.
  const background = isDark ? "#090909" : "#f4f4f5";
  const foreground = isDark ? "#f5f5f5" : "#171717";
  const muted = isDark ? "#858585" : "#737373";
  const cardSurface = isDark ? "#111111" : "#fafafa";
  const cardBorder = isDark ? "#1c1c1c" : "#ebebed";
  const iconTile = isDark ? "#181818" : "#f0f0f1";
  const status = resolveThreadListV2Status(thread);
  const statusMeta = STATUS_META[status];
  const timeLabel = threadTimeLabel(thread);
  const statusColor = statusMeta ? (isDark ? statusMeta.dark : statusMeta.light) : muted;

  const openLifecycleMenu = useCallback(() => {
    const buttons: {
      text: string;
      style?: "cancel" | "destructive" | "default";
      onPress?: () => void;
    }[] = [{ text: "Cancel", style: "cancel" }];

    if (settlementSupported) {
      if (variant === "slim") {
        buttons.unshift({
          text: "Un-settle",
          onPress: () => onUnsettleThread(thread),
        });
      } else {
        buttons.unshift({
          text: "Settle",
          onPress: () => onSettleThread(thread),
        });
      }
    }

    Alert.alert(thread.title, project?.title ?? "Thread actions", buttons);
  }, [
    onSettleThread,
    onUnsettleThread,
    project?.title,
    settlementSupported,
    thread,
    variant,
  ]);

  const statusBarColor =
    status === "working"
      ? isDark
        ? "#0ea5e9"
        : "#38bdf8"
      : status === "approval"
        ? isDark
          ? "#f59e0b"
          : "#fbbf24"
        : status === "failed"
          ? isDark
            ? "#ef4444"
            : "#f87171"
          : status === "input"
            ? isDark
              ? "#6366f1"
              : "#818cf8"
            : "transparent";

  return (
    <>
      {props.showSettledDivider ? <ThreadListV2SettledDivider isDark={isDark} /> : null}
      {variant === "card" ? (
        <Pressable
          accessibilityHint={
            settlementSupported
              ? "Opens the thread. Long-press to settle."
              : "Opens the thread."
          }
          accessibilityLabel={thread.title}
          accessibilityRole="button"
          onPress={() => onSelectThread(thread)}
          onLongPress={settlementSupported ? openLifecycleMenu : undefined}
          style={({ pressed }) => ({
            opacity: pressed ? 0.72 : 1,
            borderRadius: 14,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: cardBorder,
            backgroundColor: cardSurface,
            overflow: "hidden",
            marginBottom: 6,
          })}
        >
          <View style={{ height: 2, backgroundColor: statusBarColor }} />
          <View style={{ paddingHorizontal: 12, paddingVertical: 10, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 7,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: iconTile,
                }}
              >
                <AppIcon name="folder" size={11} color={muted} />
              </View>
              <Text
                style={{
                  flex: 1,
                  color: muted,
                  fontSize: 10,
                  fontWeight: "500",
                  letterSpacing: 0.1,
                  fontFamily: GEIST_MONO,
                }}
                numberOfLines={1}
              >
                {project?.title ?? "Project"}
              </Text>
              <Text style={{ color: statusColor, fontSize: 10, fontWeight: "600" }}>
                {statusMeta?.label ?? timeLabel}
              </Text>
            </View>
            <Text
              style={{
                color: foreground,
                fontSize: 14,
                fontWeight: "600",
                lineHeight: 19,
              }}
              numberOfLines={2}
            >
              {thread.title}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              {thread.branch ? (
                <>
                  <AppIcon name="branch" size={10} color={muted} strokeWidth={1.7} />
                  <Text
                    style={{
                      flex: 1,
                      color: muted,
                      fontFamily: GEIST_MONO,
                      fontSize: 10,
                    }}
                    numberOfLines={1}
                  >
                    {thread.branch}
                    {environmentLabel ? `  ·  ${environmentLabel}` : ""}
                  </Text>
                </>
              ) : environmentLabel ? (
                <Text style={{ flex: 1, color: muted, fontSize: 10 }} numberOfLines={1}>
                  {environmentLabel}
                </Text>
              ) : (
                <View style={{ flex: 1 }} />
              )}
              {statusMeta ? (
                <Text style={{ color: muted, fontSize: 10 }}>{timeLabel}</Text>
              ) : null}
            </View>
          </View>
        </Pressable>
      ) : (
        <Pressable
          accessibilityHint={
            settlementSupported
              ? "Opens the thread. Long-press to un-settle."
              : "Opens the thread."
          }
          accessibilityLabel={thread.title}
          accessibilityRole="button"
          onPress={() => onSelectThread(thread)}
          onLongPress={settlementSupported ? openLifecycleMenu : undefined}
          style={({ pressed }) => ({
            opacity: pressed ? 0.66 : 1,
            minHeight: 44,
            flexDirection: "row",
            alignItems: "center",
            gap: 9,
            paddingHorizontal: 8,
            paddingVertical: 8,
            backgroundColor: background,
          })}
        >
          <View style={{ opacity: 0.4 }}>
            <AppIcon name="folder" size={13} color={muted} />
          </View>
          <Text
            style={{ flex: 1, color: muted, fontSize: 14, fontWeight: "500" }}
            numberOfLines={1}
          >
            {thread.title}
          </Text>
          <Text
            style={{
              color: isDark ? "#525252" : "#a3a3a3",
              fontSize: 11,
              fontFamily: GEIST_MONO,
            }}
          >
            {timeLabel}
          </Text>
        </Pressable>
      )}
    </>
  );
});
