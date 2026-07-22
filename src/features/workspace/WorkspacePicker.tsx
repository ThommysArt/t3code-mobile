import { Pressable, Text, View } from "react-native";

import { AppIcon, type AppIconName } from "@/components/AppIcon";
import type { WorkspaceToolKind, WorkspaceToolOption } from "./workspaceTypes";

const TOOL_OPTIONS: readonly WorkspaceToolOption[] = [
  {
    kind: "browser",
    title: "Browser",
    subtitle: "Preview local dev servers",
    icon: "globe",
  },
  {
    kind: "terminal",
    title: "Terminal",
    subtitle: "Remote shell on your machine",
    icon: "terminal",
  },
  {
    kind: "files",
    title: "Files",
    subtitle: "Browse and preview project files",
    icon: "folder",
  },
  {
    kind: "diff",
    title: "Diff",
    subtitle: "Review code changes",
    icon: "file",
  },
];

export function WorkspacePicker(props: {
  readonly onSelect: (kind: WorkspaceToolKind) => void;
}) {
  return (
    <View className="flex-1 justify-center px-5 py-8">
      <Text className="mb-1 text-center text-lg font-bold text-foreground">Open a tool</Text>
      <Text className="mb-8 text-center text-sm leading-5 text-muted">
        Choose what you want to work with in this tab.
      </Text>
      <View className="gap-3">
        {TOOL_OPTIONS.map((option) => (
          <WorkspaceToolCard
            key={option.kind}
            icon={option.icon}
            subtitle={option.subtitle}
            title={option.title}
            onPress={() => props.onSelect(option.kind)}
          />
        ))}
      </View>
    </View>
  );
}

function WorkspaceToolCard(props: {
  readonly icon: AppIconName;
  readonly title: string;
  readonly subtitle: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      className="flex-row items-center gap-4 rounded-2xl border border-border bg-surface px-4 py-4"
    >
      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-default">
        <AppIcon name={props.icon} size={22} color="#2563eb" />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-base font-semibold text-foreground">{props.title}</Text>
        <Text className="mt-0.5 text-sm text-muted">{props.subtitle}</Text>
      </View>
      <AppIcon name="chevron-right" size={18} color="#737373" />
    </Pressable>
  );
}