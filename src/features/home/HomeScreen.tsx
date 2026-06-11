import type {
  EnvironmentScopedProjectShell,
  EnvironmentScopedThreadShell,
} from "@t3tools/client-runtime";
import { useRouter } from "expo-router";
import { Button, Card, Chip, Input } from "heroui-native";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Screen } from "@/components/Screen";
import { useEnvironments } from "@/runtime/EnvironmentProvider";
import { relativeTime } from "@/utils/time";

interface ProjectGroup {
  readonly project: EnvironmentScopedProjectShell;
  readonly threads: readonly EnvironmentScopedThreadShell[];
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
  const { environments, isBootstrapping, projects, reconnect, threads } = useEnvironments();
  const [search, setSearch] = useState("");

  const groups = useMemo<readonly ProjectGroup[]>(() => {
    const query = search.trim().toLowerCase();
    return projects
      .map((project) => ({
        project,
        threads: threads.filter(
          (thread) =>
            thread.environmentId === project.environmentId &&
            thread.projectId === project.id &&
            (!query ||
              thread.title.toLowerCase().includes(query) ||
              project.title.toLowerCase().includes(query) ||
              (thread.branch?.toLowerCase().includes(query) ?? false))
        ),
      }))
      .filter((group) => group.threads.length > 0)
      .sort((left, right) => {
        const leftDate = left.threads[0]?.updatedAt ?? left.threads[0]?.createdAt ?? "";
        const rightDate = right.threads[0]?.updatedAt ?? right.threads[0]?.createdAt ?? "";
        return rightDate.localeCompare(leftDate);
      });
  }, [projects, search, threads]);

  const disconnected = environments.find(
    (environment) => environment.connectionState === "disconnected"
  );

  return (
    <Screen>
      <View className="flex-row items-center justify-between px-5 pb-3 pt-2">
        <View>
          <Text className="text-3xl font-bold tracking-tight text-foreground">T3 Code</Text>
          <Text className="mt-0.5 text-xs font-semibold uppercase tracking-[2px] text-muted">
            Minimal
          </Text>
        </View>
        <Button size="sm" variant="secondary" onPress={() => router.push("/connections")}>
          Environments
        </Button>
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
          detail={disconnected.error ?? "The environment connection was interrupted."}
          actionLabel="Reconnect"
          onAction={() => void reconnect(disconnected.connection.environmentId)}
        />
      ) : null}

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-4 pb-10 pt-3"
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
                  : "Create a thread from another T3 Code client and it will appear here."}
              </Card.Description>
            </Card.Body>
          </Card>
        ) : (
          groups.map((group) => (
            <View key={`${group.project.environmentId}:${group.project.id}`} className="gap-2">
              <View className="flex-row items-center justify-between px-1">
                <Text
                  className="flex-1 text-xs font-bold uppercase tracking-[1.5px] text-muted"
                  numberOfLines={1}
                >
                  {group.project.title}
                </Text>
                <Text className="text-xs text-muted">{group.threads.length}</Text>
              </View>
              <Card className="overflow-hidden p-0">
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
              </Card>
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}
