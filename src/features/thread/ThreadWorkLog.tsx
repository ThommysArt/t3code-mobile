import type { OrchestrationCheckpointSummary } from "@t3tools/contracts";
import { useColorScheme, Pressable, ScrollView, Text, View } from "react-native";

import { AppIcon, type AppIconName } from "@/components/AppIcon";
import type { ThreadFeedActivity } from "./threadActivity";

function stripShellWrapper(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^\/bin\/zsh -lc ['"]?([\s\S]*?)['"]?$/);
  return (match?.[1] ?? trimmed).trim();
}

function compactActivityDetail(detail: string | null): string | null {
  if (!detail) return null;
  const cleaned = stripShellWrapper(detail).replace(/\s+/g, " ").trim();
  return cleaned.length > 0 ? cleaned : null;
}

function workRowIconName(icon: ThreadFeedActivity["icon"]): AppIconName {
  switch (icon) {
    case "command":
      return "terminal";
    case "globe":
      return "globe";
    case "edit":
      return "file";
    case "eye":
      return "file";
    case "alert":
    case "warning":
      return "x";
    case "check":
      return "check";
    case "message":
      return "compose";
    case "wrench":
      return "wrench";
    default:
      return "terminal";
  }
}

export function ThreadWorkLog({
  activities,
  copiedRowId,
  expandedRows,
  onCopyRow,
  onToggleRow,
}: {
  readonly activities: ReadonlyArray<ThreadFeedActivity>;
  readonly copiedRowId: string | null;
  readonly expandedRows: Readonly<Record<string, boolean>>;
  readonly onCopyRow: (rowId: string, value: string) => void;
  readonly onToggleRow: (rowId: string) => void;
}) {
  const isDark = useColorScheme() === "dark";
  const iconColor = isDark ? "#858585" : "#737373";
  const pressedBackground = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.035)";
  const rows = activities
    .filter((activity) => !(activity.toolLike && activity.status === "neutral"))
    .map((activity) => ({ ...activity, detail: compactActivityDetail(activity.detail) }));

  if (rows.length === 0) return null;

  const onlyToolRows = rows.every((row) => row.toolLike);

  return (
    <View className="-mx-1 mb-1 px-1 py-0">
      {!onlyToolRows ? (
        <Text className="px-0.5 pb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted opacity-60">
          Work log
        </Text>
      ) : null}
      <View className="gap-px">
        {rows.map((row) => {
          const expanded = expandedRows[row.id] ?? false;
          const canExpand = row.fullDetail !== null;
          const iconIsDestructive = row.icon === "alert" || row.icon === "warning";

          return (
            <View key={row.id}>
              <Pressable
                accessibilityRole={canExpand ? "button" : undefined}
                accessibilityLabel={row.detail ? `${row.summary} ${row.detail}` : row.summary}
                accessibilityState={canExpand ? { expanded } : undefined}
                hitSlop={4}
                onPress={() => {
                  if (canExpand) onToggleRow(row.id);
                }}
                onLongPress={() => onCopyRow(row.id, row.copyText)}
                style={({ pressed }) => ({
                  backgroundColor: pressed ? pressedBackground : "transparent",
                })}
                className="rounded-md px-0.5 py-0"
              >
                <View className="min-h-8 flex-row items-center gap-1.5">
                  <View className="h-[18px] w-5 shrink-0 items-center justify-center">
                    <AppIcon
                      name={workRowIconName(row.icon)}
                      size={13}
                      color={iconIsDestructive ? "#e11d48" : iconColor}
                      strokeWidth={2}
                    />
                  </View>
                  <Text className="min-w-0 flex-1 text-xs text-foreground" numberOfLines={1}>
                    <Text
                      className={`font-semibold ${iconIsDestructive ? "text-danger" : "text-foreground"}`}
                    >
                      {row.summary}
                    </Text>
                    {row.detail ? <Text className="text-muted opacity-60"> {row.detail}</Text> : null}
                  </Text>
                  <View className="shrink-0 flex-row items-center gap-px">
                    {copiedRowId === row.id ? (
                      <Text className="pr-1 text-[10px] font-semibold text-success">Copied</Text>
                    ) : null}
                    <View className="h-4 w-4 items-center justify-center">
                      {canExpand ? (
                        <AppIcon
                          name="chevron-down"
                          size={11}
                          color={iconColor}
                          strokeWidth={2.2}
                        />
                      ) : null}
                    </View>
                    <View className="h-4 w-4 items-center justify-center">
                      {row.status === "failure" ? (
                        <AppIcon name="x" size={11} color="#e11d48" strokeWidth={2.5} />
                      ) : row.status === "success" ? (
                        <AppIcon name="check" size={11} color={iconColor} strokeWidth={2.5} />
                      ) : row.status === "neutral" ? (
                        <Text className="text-[11px] text-muted">–</Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              </Pressable>
              {expanded && row.fullDetail ? (
                <View className="ml-7 border-l border-separator pb-1 pl-3 pt-0.5">
                  <ScrollView
                    nestedScrollEnabled
                    directionalLockEnabled
                    showsVerticalScrollIndicator
                    style={{ maxHeight: 240 }}
                    contentContainerStyle={{ paddingRight: 8 }}
                  >
                    <Text
                      selectable
                      className="font-mono text-[11px] leading-relaxed text-muted"
                    >
                      {row.fullDetail}
                    </Text>
                  </ScrollView>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function ThreadWorkGroupToggle({
  expanded,
  hiddenCount,
  onlyToolActivities,
  onToggle,
}: {
  readonly expanded: boolean;
  readonly hiddenCount: number;
  readonly onlyToolActivities: boolean;
  readonly onToggle: () => void;
}) {
  const isDark = useColorScheme() === "dark";
  const iconColor = isDark ? "#858585" : "#737373";
  const pressedBackground = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.035)";
  const noun = onlyToolActivities
    ? hiddenCount === 1
      ? "tool call"
      : "tool calls"
    : hiddenCount === 1
      ? "log entry"
      : "log entries";
  const collapsedLabel = `+${hiddenCount} previous ${noun}`;
  const expandedLabel = onlyToolActivities ? "Show fewer tool calls" : "Show fewer log entries";

  return (
    <View className="-mx-1 mb-1 px-1 py-0">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={expanded ? expandedLabel : collapsedLabel}
        hitSlop={4}
        onPress={onToggle}
        style={({ pressed }) => ({
          backgroundColor: pressed ? pressedBackground : "transparent",
        })}
        className="min-h-8 flex-row items-center gap-1.5 rounded-md px-0.5 py-0"
      >
        <View className="h-[18px] w-5 items-center justify-center">
          <AppIcon
            name="chevron-down"
            size={12}
            color={iconColor}
            strokeWidth={2.2}
          />
        </View>
        <Text className="text-xs font-semibold text-foreground opacity-80">
          {expanded ? expandedLabel : collapsedLabel}
        </Text>
      </Pressable>
    </View>
  );
}

export function AssistantChangedFiles({
  checkpoint,
}: {
  readonly checkpoint: OrchestrationCheckpointSummary;
}) {
  const files = checkpoint.files;
  if (files.length === 0) return null;
  const additions = files.reduce((total, file) => total + file.additions, 0);
  const deletions = files.reduce((total, file) => total + file.deletions, 0);

  return (
    <View className="mt-2 px-0.5">
      <Text className="text-[10px] font-bold uppercase tracking-[0.8px] text-muted">
        Changed files ({files.length}) · +{additions} · -{deletions}
      </Text>
      <View className="mt-1">
        {files.slice(0, 8).map((file) => {
          const normalizedPath = file.path.replaceAll("\\", "/");
          const lastSlash = normalizedPath.lastIndexOf("/");
          const directory = lastSlash >= 0 ? normalizedPath.slice(0, lastSlash + 1) : "";
          const name = lastSlash >= 0 ? normalizedPath.slice(lastSlash + 1) : normalizedPath;
          return (
            <View key={file.path} className="flex-row items-center gap-2 py-1">
              <AppIcon name="file" size={12} color="#737373" strokeWidth={2} />
              <Text className="min-w-0 flex-1 text-[11px] text-muted" numberOfLines={1}>
                {directory}
                <Text className="font-semibold text-foreground">{name}</Text>
              </Text>
              <Text className="text-[10px] font-semibold text-success">+{file.additions}</Text>
              <Text className="text-[10px] font-semibold text-danger">-{file.deletions}</Text>
            </View>
          );
        })}
        {files.length > 8 ? (
          <Text className="py-1 text-[11px] text-muted">+{files.length - 8} more files</Text>
        ) : null}
      </View>
    </View>
  );
}