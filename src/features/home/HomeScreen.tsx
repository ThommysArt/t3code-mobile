import type {
  EnvironmentScopedProjectShell,
  EnvironmentScopedThreadShell,
} from "@t3tools/client-runtime";
import { useRouter } from "expo-router";
import { Button, Card, Chip, Input, Menu } from "heroui-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Screen } from "@/components/Screen";
import { useEnvironments } from "@/runtime/EnvironmentProvider";
import { relativeTime } from "@/utils/time";

interface ProjectGroup {
  readonly key: string;
  readonly project: EnvironmentScopedProjectShell | null;
  readonly projectTitle: string;
  readonly threads: readonly EnvironmentScopedThreadShell[];
}

function scopedProjectKey(environmentId: string, projectId: string): string {
  return `${environmentId}:${projectId}`;
}

function statusColor(
  thread: EnvironmentScopedThreadShell
): "accent" | "success" | "warning" | "danger" | "default" {
  switch (thread.session?.status) {
    case "running":
    case "starting":
      return "warning";
    case "ready":
      return "success";
    case "error":
      return "danger";
    case "idle":
    case "interrupted":
    case "stopped":
    default:
      return "default";
  }
}

function statusLabel(thread: EnvironmentScopedThreadShell): string {
  const status = thread.session?.status ?? "idle";
  return status === "starting" ? "Starting" : status.charAt(0).toUpperCase() + status.slice(1);
}

export function HomeScreen() {
  const router = useRouter();
  const { environments, isBootstrapping, projects, reconnect, reloadThreads, threads } =
    useEnvironments();
  const [search, setSearch] = useState("");

  const filteredThreads = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return threads;
    return threads.filter(
      (thread) =>
        thread.title.toLowerCase().includes(query) ||
        (thread.branch?.toLowerCase().includes(query) ?? false) ||
        projects
          .find(
            (project) =>
              project.environmentId === thread.environmentId && project.id === thread.projectId
          )
          ?.title.toLowerCase()
          .includes(query)
    );
  }, [projects, search, threads]);

  const groups = useMemo<readonly ProjectGroup[]>(() => {
    const projectByKey = new Map(
      projects.map((project) => [scopedProjectKey(project.environmentId, project.id), project])
    );
    const threadsByProjectKey = new Map<string, EnvironmentScopedThreadShell[]>();

    for (const thread of filteredThreads) {
      const key = scopedProjectKey(thread.environmentId, thread.projectId);
      const existing = threadsByProjectKey.get(key);
      if (existing) {
        existing.push(thread);
      } else {
        threadsByProjectKey.set(key, [thread]);
      }
    }

    const nextGroups: ProjectGroup[] = [];
    for (const [key, groupThreads] of threadsByProjectKey) {
      const project = projectByKey.get(key) ?? null;
      nextGroups.push({
        key,
        project,
        projectTitle: project?.title ?? groupThreads[0]?.title ?? "Threads",
        threads: groupThreads.sort((left, right) =>
          (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt)
        ),
      });
    }

    return nextGroups.sort((left, right) => {
      const leftDate = left.threads[0]?.updatedAt ?? left.threads[0]?.createdAt ?? "";
      const rightDate = right.threads[0]?.updatedAt ?? right.threads[0]?.createdAt ?? "";
      return rightDate.localeCompare(leftDate);
    });
  }, [filteredThreads, projects]);

  const disconnected = environments.find(
    (environment) => environment.connectionState === "disconnected"
  );
  const connecting = environments.find(
    (environment) =>
      environment.connectionState === "connecting" || environment.connectionState === "reconnecting"
  );
  const ready = environments.find((environment) => environment.connectionState === "ready");

  const handleReconnectAll = () => {
    for (const environment of environments) {
      void reconnect(environment.connection.environmentId);
    }
  };

  return (
    <Screen>
      <View className="flex-row items-center justify-between px-5 pb-3 pt-2">
        <View>
          <Text className="text-3xl font-bold tracking-tight text-foreground">T3 Code</Text>
          <Text className="mt-0.5 text-xs font-semibold uppercase tracking-[2px] text-muted">
            Minimal
          </Text>
        </View>
        <Menu>
          <Menu.Trigger asChild>
            <Button size="sm" variant="secondary">
              Menu
            </Button>
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Overlay />
            <Menu.Content presentation="popover" width={260} placement="bottom" align="end">
              <Menu.Item
                className="items-start"
                onPress={() => {
                  router.push("/connections");
                }}
              >
                <View className="flex-1">
                  <Menu.ItemTitle>Environments</Menu.ItemTitle>
                  <Menu.ItemDescription>Manage server connections</Menu.ItemDescription>
                </View>
              </Menu.Item>
              {environments.length > 0 ? (
                <Menu.Item
                  className="items-start"
                  onPress={() => {
                    void reloadThreads();
                  }}
                >
                  <View className="flex-1">
                    <Menu.ItemTitle>Reload threads</Menu.ItemTitle>
                    <Menu.ItemDescription>Fetch the latest shell snapshot</Menu.ItemDescription>
                  </View>
                </Menu.Item>
              ) : null}
              {connecting || disconnected ? (
                <Menu.Item
                  className="items-start"
                  onPress={() => {
                    handleReconnectAll();
                  }}
                >
                  <View className="flex-1">
                    <Menu.ItemTitle>Reconnect</Menu.ItemTitle>
                    <Menu.ItemDescription>
                      {ready?.connection.label ?? connecting?.connection.label ?? "Retry connection"}
                    </Menu.ItemDescription>
                  </View>
                </Menu.Item>
              ) : null}
            </Menu.Content>
          </Menu.Portal>
        </Menu>
      </View>

      <View className="px-4 pb-2">
        <Input
          value={search}
          onChangeText={setSearch}
          placeholder="Search threads"
          returnKeyType="search"
        />
      </View>

      {disconnected ? (
        <ConnectionBanner
          title={`${disconnected.connection.label} is offline`}
          detail={
            disconnected.isCachedSnapshot
              ? `Showing cached threads from ${relativeTime(disconnected.cachedSnapshotReceivedAt ?? "")}. ${disconnected.error ?? "Reconnect to refresh."}`
              : (disconnected.error ?? "The environment connection was interrupted.")
          }
          actionLabel="Reconnect"
          onAction={() => void reconnect(disconnected.connection.environmentId)}
        />
      ) : connecting ? (
        <ConnectionBanner
          title={
            connecting.connectionState === "reconnecting"
              ? `Reconnecting to ${connecting.connection.label}`
              : `Connecting to ${connecting.connection.label}`
          }
          detail={
            threads.length > 0
              ? `Refreshing live data. Showing ${threads.length} cached thread${threads.length === 1 ? "" : "s"}.`
              : "Waiting for the server shell snapshot with projects and threads."
          }
        />
      ) : ready?.isCachedSnapshot ? (
        <ConnectionBanner
          title={`Connected to ${ready.connection.label}`}
          detail={`Showing cached threads from ${relativeTime(ready.cachedSnapshotReceivedAt ?? "")}. Syncing live data.`}
        />
      ) : null}

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ gap: 20, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 }}
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        {isBootstrapping ? (
          <ConnectionBanner
            title="Loading environments"
            detail="Restoring saved projects and threads."
          />
        ) : environments.length === 0 ? (
          <Card className="mt-8">
            <Card.Body className="gap-2">
              <Card.Title>Connect an environment</Card.Title>
              <Card.Description>
                Enter a pairing URL or server address from T3 Code to load projects and threads.
              </Card.Description>
            </Card.Body>
            <Card.Footer>
              <Button onPress={() => router.push("/connections")}>Connect</Button>
            </Card.Footer>
          </Card>
        ) : groups.length === 0 ? (
          <Card className="mt-8">
            <Card.Body className="gap-2">
              <Card.Title>{search.trim() ? "No matching threads" : "No threads yet"}</Card.Title>
              <Card.Description>
                {search.trim()
                  ? "Try a project, branch, or thread name."
                  : connecting
                    ? "The environment is connected but the shell snapshot has not arrived yet."
                    : "Create a thread from another T3 Code client and it will appear here."}
              </Card.Description>
              {!search.trim() ? (
                <Text className="text-xs leading-5 text-muted">
                  Debug: {projects.length} projects, {threads.length} threads, state{" "}
                  {ready?.connectionState ??
                    connecting?.connectionState ??
                    disconnected?.connectionState ??
                    "unknown"}
                </Text>
              ) : null}
            </Card.Body>
          </Card>
        ) : (
          groups.map((group) => (
            <View key={group.key} className="gap-2">
              <View className="flex-row items-center justify-between px-1">
                <Text
                  className="flex-1 text-xs font-bold uppercase tracking-[1.5px] text-muted"
                  numberOfLines={1}
                >
                  {group.projectTitle}
                </Text>
                <Text className="text-xs text-muted">{group.threads.length}</Text>
              </View>
              <View className="overflow-hidden rounded-2xl border border-divider bg-default-50">
                {group.threads.map((thread, index) => (
                  <Pressable
                    key={`${thread.environmentId}:${thread.id}`}
                    onPress={() =>
                      router.push({
                        pathname: "/threads/[environmentId]/[threadId]",
                        params: {
                          environmentId: thread.environmentId,
                          threadId: thread.id,
                        },
                      })
                    }
                    className={`px-4 py-4 active:bg-default-100 ${
                      index > 0 ? "border-t border-divider" : ""
                    }`}
                  >
                    <View className="flex-row items-start gap-3">
                      <View className="mt-1 h-9 w-9 items-center justify-center rounded-xl bg-default-100">
                        <Text className="text-base font-bold text-muted">G</Text>
                      </View>
                      <View className="flex-1 gap-1.5">
                        <View className="flex-row items-center gap-2">
                          <Text
                            className="flex-1 text-base font-semibold text-foreground"
                            numberOfLines={1}
                          >
                            {thread.title}
                          </Text>
                          <Chip size="sm" variant="soft" color={statusColor(thread)}>
                            {statusLabel(thread)}
                          </Chip>
                          <Text className="text-xs text-muted">
                            {relativeTime(thread.updatedAt ?? thread.createdAt)}
                          </Text>
                        </View>
                        <Text className="text-xs text-muted" numberOfLines={1}>
                          {thread.branch ?? "No branch"}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}