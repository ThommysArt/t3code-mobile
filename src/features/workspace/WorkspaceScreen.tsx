import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { getTerminalLabel } from "@t3tools/shared/terminalLabels";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/AppIcon";
import { BlurScreenRoot, HeaderBubble, HeaderSpacer } from "@/components/chrome";
import { useChromeTheme } from "@/components/chrome/useChromeTheme";
import { Screen } from "@/components/Screen";
import { useEnvironments } from "@/runtime/EnvironmentProvider";
import { useThread } from "@/runtime/useThread";
import { WorkspaceBrowserTab } from "./WorkspaceBrowserTab";
import { WorkspaceDiffTab } from "./WorkspaceDiffTab";
import { WorkspaceFilesTab } from "./WorkspaceFilesTab";
import { WorkspacePicker } from "./WorkspacePicker";
import { WorkspacePlaceholderTab } from "./WorkspacePlaceholderTab";
import { WorkspaceTerminalTab } from "./WorkspaceTerminalTab";
import { useWorkspaceTabs } from "./useWorkspaceTabs";
import type { WorkspaceTab } from "./workspaceTypes";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function inferPlatformFromPath(path: string): string {
  if (/^[a-zA-Z]:[\\/]/.test(path) || path.includes("\\")) {
    return "win32";
  }
  return "linux";
}

function tabLabel(tab: WorkspaceTab): string {
  switch (tab.kind) {
    case "picker":
      return "New";
    case "browser":
      return "Browser";
    case "terminal":
      return getTerminalLabel(tab.terminalId);
    case "files":
      return "Files";
    case "diff":
      return "Diff";
  }
}

export function WorkspaceScreen() {
  const params = useLocalSearchParams<{
    environmentId?: string | string[];
    threadId?: string | string[];
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [headerHeight, setHeaderHeight] = useState(insets.top + 52);
  const theme = useChromeTheme();
  const environmentId = EnvironmentId.make(firstParam(params.environmentId));
  const threadId = ThreadId.make(firstParam(params.threadId));
  const { projects, getEnvironment } = useEnvironments();
  const { shell, thread, connectionState } = useThread(environmentId, threadId);
  const { tabs, activeTabId, setActiveTabId, addTab, closeTab, selectTool } = useWorkspaceTabs({
    environmentId,
    threadId,
  });

  const project = useMemo(
    () =>
      projects.find(
        (candidate) =>
          candidate.environmentId === environmentId && candidate.id === (thread?.projectId ?? shell?.projectId)
      ) ?? null,
    [environmentId, projects, shell?.projectId, thread?.projectId]
  );

  const workspaceRoot = project?.workspaceRoot ?? null;
  const worktreePath = thread?.worktreePath ?? shell?.worktreePath ?? null;
  const live = connectionState === "ready";
  const environment = getEnvironment(environmentId);
  const threadTitle = thread?.title ?? shell?.title ?? "Thread";

  const renderTabContent = (tab: WorkspaceTab) => {
    if (tab.kind === "picker") {
      return <WorkspacePicker onSelect={(kind) => selectTool(tab.id, kind)} />;
    }

    if (tab.kind === "terminal") {
      if (!workspaceRoot) {
        return (
          <WorkspacePlaceholderTab
            icon="terminal"
            title="No workspace root"
            detail="This thread does not have a workspace root yet, so there is nowhere to open a shell."
          />
        );
      }

      return (
        <WorkspaceTerminalTab
          environmentId={environmentId}
          threadId={threadId}
          workspaceRoot={workspaceRoot}
          worktreePath={worktreePath}
          terminalId={tab.terminalId}
          live={live}
        />
      );
    }

    if (tab.kind === "browser") {
      return <WorkspaceBrowserTab environmentId={environmentId} live={live} />;
    }

    if (tab.kind === "files") {
      if (!workspaceRoot) {
        return (
          <WorkspacePlaceholderTab
            icon="folder"
            title="No workspace root"
            detail="This thread does not have a workspace root yet, so there are no files to browse."
          />
        );
      }

      return (
        <WorkspaceFilesTab
          environmentId={environmentId}
          workspaceRoot={workspaceRoot}
          platform={inferPlatformFromPath(workspaceRoot)}
          live={live}
        />
      );
    }

    const diffCwd = worktreePath ?? workspaceRoot;
    return (
      <WorkspaceDiffTab
        environmentId={environmentId}
        threadId={threadId}
        cwd={diffCwd}
        checkpoints={thread?.checkpoints ?? []}
        live={live}
      />
    );
  };

  return (
    <Screen edges={["left", "right"]}>
      <BlurScreenRoot
        onHeaderHeightChange={setHeaderHeight}
        header={
          <>
            <HeaderBubble accessibilityLabel="Go back" onPress={() => router.back()} variant="icon">
              <AppIcon name="back" size={21} color={theme.foreground} />
            </HeaderBubble>
            <HeaderBubble subtitle={environment?.connection.label ?? "Workspace"} title={threadTitle} variant="title" />
            <HeaderSpacer />
            <HeaderBubble accessibilityLabel="Add tab" onPress={addTab} variant="icon">
              <AppIcon name="plus" size={20} color={theme.foreground} />
            </HeaderBubble>
          </>
        }
      >
        <View className="flex-1" style={{ paddingTop: headerHeight }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="max-h-12 flex-grow-0 border-b border-border"
            contentContainerStyle={{ paddingHorizontal: 12, gap: 6, alignItems: "center" }}
          >
            {tabs.map((tab) => {
              const active = tab.id === activeTabId;
              return (
                <View key={tab.id} className="flex-row items-center">
                  <Pressable
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => setActiveTabId(tab.id)}
                    className={`flex-row items-center gap-1.5 rounded-full px-3 py-2 ${
                      active ? "bg-accent" : "bg-default"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${active ? "text-white" : "text-muted"}`}
                      numberOfLines={1}
                    >
                      {tabLabel(tab)}
                    </Text>
                    {tabs.length > 1 ? (
                      <Pressable
                        accessibilityLabel={`Close ${tabLabel(tab)} tab`}
                        hitSlop={8}
                        onPress={() => closeTab(tab.id)}
                      >
                        <AppIcon
                          name="x"
                          size={12}
                          color={active ? "#ffffff" : "#737373"}
                          strokeWidth={2.5}
                        />
                      </Pressable>
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
          <View className="flex-1">
            {tabs.map((tab) => (
              <View
                key={tab.id}
                className="flex-1"
                style={{ display: tab.id === activeTabId ? "flex" : "none" }}
              >
                {renderTabContent(tab)}
              </View>
            ))}
          </View>
        </View>
      </BlurScreenRoot>
    </Screen>
  );
}