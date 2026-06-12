import { CommandId, EnvironmentId, ThreadId } from "@t3tools/contracts";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  useColorScheme,
  View,
} from "react-native";

import { AppIcon } from "@/components/AppIcon";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Screen } from "@/components/Screen";
import { useEnvironments } from "@/runtime/EnvironmentProvider";
import { useArchivedThreads } from "@/runtime/useArchivedThreads";
import { usePrimaryEnvironment } from "@/runtime/usePrimaryEnvironment";
import { formatRemoteError } from "@/runtime/statusLog";
import { newId } from "@/utils/id";
import { formatRelativeTimeLabel } from "@/utils/time";

import {
  EnvironmentPicker,
  SettingsDivider,
  SettingsLoadingRow,
  SettingsScreenHeader,
  SettingsScroll,
  SettingsSection,
} from "./SettingsComponents";

interface ArchivedThreadRow {
  readonly environmentId: EnvironmentId;
  readonly threadId: string;
  readonly title: string;
  readonly archivedAt: string;
  readonly createdAt: string;
}

interface ArchivedProjectGroup {
  readonly key: string;
  readonly title: string;
  readonly threads: readonly ArchivedThreadRow[];
}

export function ArchivesScreen() {
  const isDark = useColorScheme() === "dark";
  const { dispatchCommand, getClient } = useEnvironments();
  const { readyEnvironments, selectEnvironment } = usePrimaryEnvironment();
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<EnvironmentId | null>(null);

  const environmentIds = useMemo(() => {
    if (selectedEnvironmentId) return [selectedEnvironmentId];
    return readyEnvironments.map((environment) => environment.connection.environmentId);
  }, [readyEnvironments, selectedEnvironmentId]);

  const { snapshots, isLoading, error, refresh } = useArchivedThreads(environmentIds);
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const grouped: ArchivedProjectGroup[] = [];

    for (const entry of snapshots) {
      const projectsById = new Map(
        entry.snapshot.projects.map((project) => [project.id, project] as const)
      );
      const threadsByProjectId = new Map<string, ArchivedThreadRow[]>();

      for (const thread of entry.snapshot.threads) {
        if (!thread.archivedAt) continue;
        const rows = threadsByProjectId.get(String(thread.projectId)) ?? [];
        rows.push({
          environmentId: entry.environmentId,
          threadId: thread.id,
          title: thread.title,
          archivedAt: thread.archivedAt,
          createdAt: thread.createdAt,
        });
        threadsByProjectId.set(String(thread.projectId), rows);
      }

      for (const [projectId, projectThreads] of threadsByProjectId) {
        const project = projectsById.get(projectId as never);
        grouped.push({
          key: `${entry.environmentId}:${projectId}`,
          title: project?.title ?? "Unknown project",
          threads: [...projectThreads].sort((left, right) => {
            const leftKey = left.archivedAt || left.createdAt;
            const rightKey = right.archivedAt || right.createdAt;
            return rightKey.localeCompare(leftKey) || right.threadId.localeCompare(left.threadId);
          }),
        });
      }
    }

    return grouped.sort((left, right) => left.title.localeCompare(right.title));
  }, [snapshots]);

  const hasLiveConnection = environmentIds.some((environmentId) => Boolean(getClient(environmentId)));

  const unarchiveThread = async (thread: ArchivedThreadRow) => {
    setPendingThreadId(thread.threadId);
    try {
      await dispatchCommand(thread.environmentId, {
        type: "thread.unarchive",
        commandId: CommandId.make(newId()),
        threadId: ThreadId.make(thread.threadId),
      });
      await refresh();
    } catch (unarchiveError) {
      Alert.alert(
        "Could not unarchive thread",
        formatRemoteError(unarchiveError) || "The server rejected the unarchive request."
      );
    } finally {
      setPendingThreadId(null);
    }
  };

  return (
    <Screen>
      <SettingsScreenHeader
        title="Archives"
        subtitle="Browse and restore archived threads"
        action={
          <Pressable
            disabled={!hasLiveConnection || isLoading}
            onPress={() => void refresh()}
            className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface"
            style={{ opacity: !hasLiveConnection || isLoading ? 0.5 : 1 }}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#f97316" />
            ) : (
              <AppIcon name="refresh" size={19} color={isDark ? "#f5f5f5" : "#262626"} />
            )}
          </Pressable>
        }
      />
      <SettingsScroll>
        <EnvironmentPicker
          environments={readyEnvironments.map((environment) => ({
            environmentId: environment.connection.environmentId,
            label: environment.connection.label,
            connectionState: environment.connectionState,
          }))}
          selectedEnvironmentId={selectedEnvironmentId}
          onSelect={(nextEnvironmentId) => {
            const id = EnvironmentId.make(nextEnvironmentId);
            setSelectedEnvironmentId(id);
            selectEnvironment(id);
          }}
        />

        {!hasLiveConnection ? (
          <ConnectionBanner
            title="Live connection required"
            detail="Connect to a server over WebSocket to load archived threads and restore them."
          />
        ) : null}

        {error ? <ConnectionBanner title="Could not load archives" detail={error} /> : null}

        {isLoading && groups.length === 0 ? (
          <SettingsSection title="Archived threads">
            <SettingsLoadingRow label="Loading archived threads..." />
          </SettingsSection>
        ) : groups.length === 0 ? (
          <SettingsSection title="Archived threads">
            <View className="px-4 py-5">
              <Text className="text-sm leading-5 text-muted">
                {hasLiveConnection
                  ? "No archived threads yet. Archived threads will appear here."
                  : "Connect to a server to load archived threads."}
              </Text>
            </View>
          </SettingsSection>
        ) : (
          groups.map((group) => (
            <SettingsSection key={group.key} title={group.title}>
              {group.threads.map((thread, index) => (
                <View key={`${thread.environmentId}:${thread.threadId}`}>
                  {index > 0 ? <SettingsDivider /> : null}
                  <View className="gap-3 px-4 py-4">
                    <Text className="text-base font-semibold text-foreground" numberOfLines={2}>
                      {thread.title}
                    </Text>
                    <Text className="text-sm text-muted">
                      Archived {formatRelativeTimeLabel(thread.archivedAt)} · Created{" "}
                      {formatRelativeTimeLabel(thread.createdAt)}
                    </Text>
                    <View className="flex-row justify-end">
                      <Pressable
                        disabled={pendingThreadId === thread.threadId}
                        onPress={() => void unarchiveThread(thread)}
                        className="flex-row items-center gap-2 rounded-full border border-border bg-default px-4 py-2"
                        style={{ opacity: pendingThreadId === thread.threadId ? 0.5 : 1 }}
                      >
                        <Text className="text-sm font-semibold text-foreground">Unarchive</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </SettingsSection>
          ))
        )}
      </SettingsScroll>
    </Screen>
  );
}