"use no memo";

import React from "react";
import { FlexWidget, TextWidget } from "react-native-android-widget";

import type { ThreadListV2Status } from "../home/threadListV2";
import {
  formatWidgetRelativeTime,
  statusLabel,
  threadWidgetDeepLink,
  type LatestThreadWidgetItem,
  type LatestThreadsWidgetSelection,
} from "./latestThreads";

export type LatestThreadsWidgetTheme = "light" | "dark";

type HexColor = `#${string}`;

export interface LatestThreadsWidgetProps {
  readonly selection: LatestThreadsWidgetSelection;
  readonly theme: LatestThreadsWidgetTheme;
  readonly nowMs?: number;
}

interface ThemeColors {
  readonly background: HexColor;
  readonly surface: HexColor;
  readonly border: HexColor;
  readonly foreground: HexColor;
  readonly muted: HexColor;
  readonly accent: HexColor;
  readonly settledSurface: HexColor;
}

const THEMES: Record<LatestThreadsWidgetTheme, ThemeColors> = {
  dark: {
    background: "#090909",
    surface: "#141414",
    border: "#1f1f1f",
    foreground: "#f5f5f5",
    muted: "#858585",
    accent: "#38bdf8",
    settledSurface: "#101010",
  },
  light: {
    background: "#f4f4f5",
    surface: "#ffffff",
    border: "#e4e4e7",
    foreground: "#171717",
    muted: "#737373",
    accent: "#0284c7",
    settledSurface: "#fafafa",
  },
};

const STATUS_COLORS: Record<
  ThreadListV2Status,
  { readonly dark: HexColor; readonly light: HexColor }
> = {
  approval: { dark: "#fbbf24", light: "#b45309" },
  input: { dark: "#a5b4fc", light: "#4338ca" },
  working: { dark: "#38bdf8", light: "#0284c7" },
  failed: { dark: "#f87171", light: "#b91c1c" },
  ready: { dark: "#858585", light: "#737373" },
};

function threadMetaLine(item: LatestThreadWidgetItem, nowMs: number): string {
  const parts: string[] = [];
  if (item.projectTitle) parts.push(item.projectTitle);
  if (item.thread.branch) parts.push(item.thread.branch);
  const time = formatWidgetRelativeTime(
    item.thread.latestUserMessageAt ?? item.thread.updatedAt ?? item.thread.createdAt,
    nowMs
  );
  if (time) parts.push(time);
  return parts.join(" · ");
}

function ThreadRow(props: {
  readonly item: LatestThreadWidgetItem;
  readonly colors: ThemeColors;
  readonly theme: LatestThreadsWidgetTheme;
  readonly nowMs: number;
  readonly isLast: boolean;
}) {
  const { item, colors, theme, nowMs, isLast } = props;
  const statusColor = STATUS_COLORS[item.status][theme];
  const showStatus = item.variant === "active" && item.status !== "ready";
  const rowBackground = item.variant === "settled" ? colors.settledSurface : colors.surface;

  return (
    <FlexWidget
      style={{
        width: "match_parent",
        flexDirection: "column",
        backgroundColor: rowBackground,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: isLast ? 0 : 6,
      }}
      clickAction="OPEN_URI"
      clickActionData={{
        uri: threadWidgetDeepLink(item.thread.environmentId, item.thread.id),
      }}
      accessibilityLabel={`${item.thread.title}. ${statusLabel(item.status)}. ${threadMetaLine(item, nowMs)}`}
    >
      <FlexWidget
        style={{
          width: "match_parent",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <TextWidget
          text={item.thread.title || "Untitled thread"}
          maxLines={1}
          truncate="END"
          style={{
            fontSize: 14,
            fontWeight: "600",
            color: item.variant === "settled" ? colors.muted : colors.foreground,
          }}
        />
        {showStatus ? (
          <TextWidget
            text={statusLabel(item.status)}
            style={{
              fontSize: 11,
              fontWeight: "600",
              color: statusColor,
              marginLeft: 8,
            }}
          />
        ) : null}
      </FlexWidget>
      {threadMetaLine(item, nowMs) ? (
        <TextWidget
          text={threadMetaLine(item, nowMs)}
          maxLines={1}
          truncate="END"
          style={{
            fontSize: 11,
            color: colors.muted,
            marginTop: 2,
          }}
        />
      ) : null}
    </FlexWidget>
  );
}

export function LatestThreadsWidget(props: LatestThreadsWidgetProps) {
  const colors = THEMES[props.theme];
  const nowMs = props.nowMs ?? Date.now();
  const { selection } = props;
  const headerCount =
    selection.activeCount > 0
      ? `${selection.activeCount} active`
      : selection.totalThreadCount > 0
        ? "All settled"
        : "No threads";

  return (
    <FlexWidget
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "column",
        backgroundColor: colors.background,
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingTop: 12,
        paddingBottom: 10,
      }}
      clickAction="OPEN_APP"
      accessibilityLabel={`Latest threads. ${headerCount}.`}
    >
      <FlexWidget
        style={{
          width: "match_parent",
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
          paddingHorizontal: 2,
        }}
      >
        <TextWidget
          text="Latest threads"
          style={{
            fontSize: 15,
            fontWeight: "700",
            color: colors.foreground,
          }}
        />
        <TextWidget
          text={headerCount}
          style={{
            fontSize: 11,
            fontWeight: "600",
            color: colors.accent,
          }}
        />
      </FlexWidget>

      {selection.items.length === 0 ? (
        <FlexWidget
          style={{
            width: "match_parent",
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: 16,
          }}
          clickAction="OPEN_APP"
        >
          <TextWidget
            text="No threads yet"
            style={{ fontSize: 14, fontWeight: "600", color: colors.foreground }}
          />
          <TextWidget
            text="Open T3 Code to start one"
            style={{ fontSize: 12, color: colors.muted, marginTop: 4 }}
          />
        </FlexWidget>
      ) : (
        <FlexWidget
          style={{
            width: "match_parent",
            flexDirection: "column",
            flex: 1,
          }}
        >
          {selection.items.map((item, index) => (
            <ThreadRow
              key={`${item.thread.environmentId}:${item.thread.id}`}
              item={item}
              colors={colors}
              theme={props.theme}
              nowMs={nowMs}
              isLast={index === selection.items.length - 1}
            />
          ))}
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
