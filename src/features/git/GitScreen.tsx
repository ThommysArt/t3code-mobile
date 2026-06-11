import {
  buildMenuItems,
  getGitActionDisabledReason,
  requiresDefaultBranchConfirmation,
  resolveQuickAction,
  type GitActionRequestInput,
} from "@t3tools/client-runtime";
import {
  EnvironmentId,
  type GitActionProgressEvent,
  type GitRunStackedActionResult,
  type GitStackedAction,
} from "@t3tools/contracts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, Checkbox, Chip, Input } from "heroui-native";
import { useCallback, useMemo, useState } from "react";
import { Alert, Linking, ScrollView, Text, View } from "react-native";

import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Screen } from "@/components/Screen";
import { useEnvironments } from "@/runtime/EnvironmentProvider";
import { useThread } from "@/runtime/useThread";
import { useVcsStatus } from "@/runtime/useVcsStatus";
import { newId } from "@/utils/id";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function progressLabel(event: GitActionProgressEvent): string {
  switch (event.kind) {
    case "phase_started":
      return event.label;
    case "hook_started":
      return `Running ${event.hookName}`;
    case "hook_output":
      return event.text;
    case "action_failed":
      return event.message;
    case "action_started":
      return "Starting source-control action";
    case "hook_finished":
      return "Finishing checks";
    case "action_finished":
      return event.result.toast.title;
  }
}

function confirmDefaultBranch(action: GitStackedAction, branch: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Run on default branch?",
      `This action will update "${branch}". Continue only if that is intentional.`,
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Continue", style: "destructive", onPress: () => resolve(true) },
      ],
      { cancelable: false }
    );
  });
}

function actionIncludesCommit(action: GitStackedAction): boolean {
  return action === "commit" || action === "commit_push" || action === "commit_push_pr";
}

export function GitScreen() {
  const params = useLocalSearchParams<{
    environmentId?: string | string[];
    threadId?: string | string[];
  }>();
  const router = useRouter();
  const environmentIdRaw = firstParam(params.environmentId);
  const threadIdRaw = firstParam(params.threadId);
  const environmentId = EnvironmentId.make(environmentIdRaw);
  const { getClient, projects } = useEnvironments();
  const { shell, thread } = useThread(environmentIdRaw, threadIdRaw);
  const project = projects.find(
    (candidate) =>
      candidate.environmentId === environmentId &&
      candidate.id === (thread?.projectId ?? shell?.projectId)
  );
  const cwd = thread?.worktreePath ?? shell?.worktreePath ?? project?.workspaceRoot ?? null;
  const git = useVcsStatus(environmentId, cwd);
  const [commitMessage, setCommitMessage] = useState("");
  const [excludedFiles, setExcludedFiles] = useState<ReadonlySet<string>>(new Set());
  const [operationLabel, setOperationLabel] = useState<string | null>(null);

  const status = git.data;
  const files = status?.workingTree.files ?? [];
  const selectedFiles = files.filter((file) => !excludedFiles.has(file.path));
  const busy = operationLabel !== null;
  const menuItems = useMemo(
    () => buildMenuItems(status, busy, status?.hasPrimaryRemote ?? false),
    [busy, status]
  );
  const quickAction = useMemo(
    () =>
      resolveQuickAction(
        status,
        busy,
        status?.isDefaultRef ?? false,
        status?.hasPrimaryRemote ?? false
      ),
    [busy, status]
  );

  const runAction = useCallback(
    async (input: GitActionRequestInput) => {
      const client = getClient(environmentId);
      if (!client || !cwd || busy) return;
      const branch = status?.refName;
      if (
        branch &&
        requiresDefaultBranchConfirmation(input.action, status?.isDefaultRef ?? false) &&
        !(await confirmDefaultBranch(input.action, branch))
      ) {
        return;
      }

      setOperationLabel("Starting source-control action");
      try {
        const result: GitRunStackedActionResult = await client.git.runStackedAction(
          {
            cwd,
            actionId: newId(),
            ...input,
          },
          {
            onProgress: (event) => setOperationLabel(progressLabel(event)),
          }
        );
        await git.refresh();
        const openPrCta = result.toast.cta.kind === "open_pr" ? result.toast.cta : null;
        Alert.alert(result.toast.title, result.toast.description, [
          ...(openPrCta
            ? [
                {
                  text: openPrCta.label,
                  onPress: () => void Linking.openURL(openPrCta.url),
                },
              ]
            : []),
          { text: "Done" },
        ]);
      } catch (error) {
        Alert.alert(
          "Git action failed",
          error instanceof Error ? error.message : "The source-control action failed."
        );
      } finally {
        setOperationLabel(null);
      }
    },
    [busy, cwd, environmentId, getClient, git, status?.isDefaultRef, status?.refName]
  );

  const runQuickAction = useCallback(async () => {
    if (quickAction.kind === "open_pr") {
      const url = status?.pr?.state === "open" ? status.pr.url : null;
      if (url) await Linking.openURL(url);
      return;
    }
    if (quickAction.kind === "run_pull") {
      const client = getClient(environmentId);
      if (!client || !cwd) return;
      setOperationLabel("Pulling latest changes");
      try {
        await client.vcs.pull({ cwd });
        await git.refresh();
      } catch (error) {
        Alert.alert("Pull failed", error instanceof Error ? error.message : "Unable to pull.");
      } finally {
        setOperationLabel(null);
      }
      return;
    }
    if (quickAction.kind === "run_action" && quickAction.action) {
      if (
        actionIncludesCommit(quickAction.action) &&
        files.length > 0 &&
        selectedFiles.length === 0
      ) {
        Alert.alert("No files selected", "Select at least one changed file before committing.");
        return;
      }
      await runAction({
        action: quickAction.action,
        ...(commitMessage.trim() ? { commitMessage: commitMessage.trim() } : {}),
        ...(selectedFiles.length > 0 && selectedFiles.length !== files.length
          ? { filePaths: selectedFiles.map((file) => file.path) }
          : {}),
      });
    }
  }, [
    commitMessage,
    cwd,
    environmentId,
    files.length,
    getClient,
    git,
    quickAction,
    runAction,
    selectedFiles,
    status?.pr,
  ]);

  return (
    <Screen>
      <View className="flex-row items-center gap-3 border-b border-divider px-4 pb-3 pt-1">
        <Button size="sm" variant="ghost" onPress={() => router.back()}>
          Back
        </Button>
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground">Source control</Text>
          <Text className="text-xs text-muted" numberOfLines={1}>
            {status?.refName ?? thread?.branch ?? shell?.branch ?? "Checking branch..."}
          </Text>
        </View>
        <Button
          size="sm"
          variant="secondary"
          isDisabled={busy || git.isPending}
          onPress={() => void git.refresh()}
        >
          Refresh
        </Button>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-4 pb-10 pt-4"
        keyboardShouldPersistTaps="handled"
      >
        {!cwd ? (
          <ConnectionBanner
            title="Repository unavailable"
            detail="This thread does not have a project workspace or worktree path."
          />
        ) : null}
        {git.error ? <ConnectionBanner title="Git status failed" detail={git.error} /> : null}

        <Card>
          <Card.Body className="gap-3">
            <View className="flex-row items-center justify-between">
              <View className="flex-1">
                <Card.Title>{status?.refName ?? "Repository"}</Card.Title>
                <Card.Description numberOfLines={1}>{cwd ?? "No checkout"}</Card.Description>
              </View>
              <Chip
                size="sm"
                color={status?.hasWorkingTreeChanges ? "warning" : "success"}
                variant="soft"
              >
                {status?.hasWorkingTreeChanges ? `${files.length} changed` : "Clean"}
              </Chip>
            </View>
            {status ? (
              <Text className="text-sm text-muted">
                {status.aheadCount} ahead · {status.behindCount} behind
                {status.pr?.state === "open" ? ` · PR #${status.pr.number}` : ""}
              </Text>
            ) : null}
          </Card.Body>
        </Card>

        {operationLabel ? (
          <Card variant="secondary">
            <Card.Body>
              <Text className="text-sm font-medium text-foreground" numberOfLines={2}>
                {operationLabel}
              </Text>
            </Card.Body>
          </Card>
        ) : null}

        {files.length > 0 ? (
          <Card>
            <Card.Body className="gap-3">
              <View>
                <Card.Title>Changed files</Card.Title>
                <Card.Description>
                  Choose which files are included when committing.
                </Card.Description>
              </View>
              {files.map((file) => {
                const selected = !excludedFiles.has(file.path);
                return (
                  <Checkbox
                    key={file.path}
                    isSelected={selected}
                    onSelectedChange={() =>
                      setExcludedFiles((current) => {
                        const next = new Set(current);
                        if (selected) next.add(file.path);
                        else next.delete(file.path);
                        return next;
                      })
                    }
                  >
                    <View className="flex-1 flex-row items-center gap-2">
                      <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                        {file.path}
                      </Text>
                      <Text className="text-xs font-medium text-success">+{file.insertions}</Text>
                      <Text className="text-xs font-medium text-danger">-{file.deletions}</Text>
                    </View>
                  </Checkbox>
                );
              })}
            </Card.Body>
          </Card>
        ) : null}

        <Card>
          <Card.Body className="gap-3">
            <View>
              <Card.Title>Commit message</Card.Title>
              <Card.Description>Leave blank to let the server generate a message.</Card.Description>
            </View>
            <Input
              value={commitMessage}
              onChangeText={setCommitMessage}
              placeholder="Describe the change"
            />
          </Card.Body>
        </Card>

        <View className="gap-3">
          <Button
            size="lg"
            isDisabled={quickAction.disabled || busy}
            onPress={() => void runQuickAction()}
          >
            {quickAction.label}
          </Button>
          {quickAction.disabled && quickAction.hint ? (
            <Text className="px-2 text-center text-xs leading-5 text-muted">
              {quickAction.hint}
            </Text>
          ) : null}

          <View className="flex-row gap-3">
            {menuItems.map((item) => {
              const noCommitFiles = item.id === "commit" && selectedFiles.length === 0;
              const reason = noCommitFiles
                ? "Select at least one changed file."
                : getGitActionDisabledReason({
                    item,
                    gitStatus: status,
                    isBusy: busy,
                    hasOriginRemote: status?.hasPrimaryRemote ?? false,
                  });
              return (
                <View key={item.id} className="flex-1 gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={item.disabled || noCommitFiles}
                    onPress={() => {
                      if (item.kind === "open_pr") {
                        const url = status?.pr?.state === "open" ? status.pr.url : null;
                        if (url) void Linking.openURL(url);
                        return;
                      }
                      if (item.dialogAction) {
                        void runAction({
                          action: item.dialogAction,
                          ...(item.dialogAction === "commit" && commitMessage.trim()
                            ? { commitMessage: commitMessage.trim() }
                            : {}),
                          ...(item.dialogAction === "commit" &&
                          selectedFiles.length > 0 &&
                          selectedFiles.length !== files.length
                            ? { filePaths: selectedFiles.map((file) => file.path) }
                            : {}),
                        });
                      }
                    }}
                  >
                    {item.label}
                  </Button>
                  {reason ? (
                    <Text
                      className="text-center text-[10px] leading-4 text-muted"
                      numberOfLines={2}
                    >
                      {reason}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}
