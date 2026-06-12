import {
  buildMenuItems,
  getGitActionDisabledReason,
  requiresDefaultBranchConfirmation,
  resolveDefaultBranchActionDialogCopy,
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
import { Button, Card, Chip, Input, useToast } from "heroui-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Text, useColorScheme, View } from "react-native";

import { AppIcon } from "@/components/AppIcon";
import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Screen } from "@/components/Screen";
import { useEnvironments } from "@/runtime/EnvironmentProvider";
import { logStatus } from "@/runtime/statusLog";
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

function actionIncludesCommit(action: GitStackedAction): boolean {
  return action === "commit" || action === "commit_push" || action === "commit_push_pr";
}

export function GitScreen() {
  const params = useLocalSearchParams<{
    environmentId?: string | string[];
    threadId?: string | string[];
  }>();
  const router = useRouter();
  const isDark = useColorScheme() === "dark";
  const { toast } = useToast();
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
  const [isEditingFiles, setIsEditingFiles] = useState(false);
  const [operationLabel, setOperationLabel] = useState<string | null>(null);
  const runActionRef = useRef<(input: GitActionRequestInput) => Promise<void>>(async () => {});

  const status = git.data;
  const files = status?.workingTree.files ?? [];
  const selectedFiles = files.filter((file) => !excludedFiles.has(file.path));
  const selectedInsertions = selectedFiles.reduce((total, file) => total + file.insertions, 0);
  const selectedDeletions = selectedFiles.reduce((total, file) => total + file.deletions, 0);
  const selectedFilePreview = selectedFiles.slice(0, 3);
  const allFilesSelected = excludedFiles.size === 0;
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

  const confirmDefaultBranch = useCallback(
    (action: GitStackedAction, branch: string): Promise<boolean> => {
      if (action === "commit") return Promise.resolve(true);
      const copy = resolveDefaultBranchActionDialogCopy({
        action,
        branchName: branch,
        includesCommit: actionIncludesCommit(action),
      });
      return new Promise((resolve) => {
        let resolved = false;
        let toastId = "";
        toastId = toast.show({
          variant: "warning",
          duration: "persistent",
          label: copy.title,
          description: copy.description,
          actionLabel: copy.continueLabel,
          onActionPress: ({ hide }) => {
            resolved = true;
            hide(toastId);
            resolve(true);
          },
          onHide: () => {
            if (!resolved) resolve(false);
          },
        });
      });
    },
    [toast]
  );

  const runAction = useCallback(
    async (input: GitActionRequestInput) => {
      const client = getClient(environmentId);
      if (!client || !cwd || busy) {
        if (!client) {
          toast.show({
            variant: "danger",
            label: "Live connection required",
            description: "Reconnect the environment before running source-control actions.",
          });
        }
        return;
      }
      const branch = status?.refName;
      if (
        branch &&
        requiresDefaultBranchConfirmation(input.action, status?.isDefaultRef ?? false) &&
        !(await confirmDefaultBranch(input.action, branch))
      ) {
        return;
      }

      setOperationLabel("Starting source-control action");
      logStatus("git", "info", "Source-control action started", input.action, {
        environmentId,
        phase: "syncing",
        inProgress: true,
      });
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
        logStatus("git", "success", result.toast.title, result.toast.description, {
          environmentId,
          inProgress: false,
          toast: false,
        });
        const cta = result.toast.cta;
        toast.show({
          variant: "success",
          label: result.toast.title,
          description: result.toast.description,
          duration: cta.kind === "none" ? 4000 : 8000,
          actionLabel: cta.kind === "none" ? undefined : cta.label,
          onActionPress:
            cta.kind === "none"
              ? undefined
              : () => {
                  if (cta.kind === "open_pr") {
                    void Linking.openURL(cta.url);
                  } else {
                    void runActionRef.current({ action: cta.action.kind });
                  }
                },
        });
      } catch (error) {
        logStatus(
          "git",
          "danger",
          "Source-control action failed",
          error instanceof Error ? error.message : "The source-control action failed.",
          { environmentId, phase: "error", inProgress: false }
        );
      } finally {
        setOperationLabel(null);
      }
    },
    [
      busy,
      confirmDefaultBranch,
      cwd,
      environmentId,
      getClient,
      git,
      status?.isDefaultRef,
      status?.refName,
      toast,
    ]
  );

  useEffect(() => {
    runActionRef.current = runAction;
  }, [runAction]);

  const runQuickAction = useCallback(async () => {
    if (quickAction.kind === "open_pr") {
      const url = status?.pr?.state === "open" ? status.pr.url : null;
      if (url) await Linking.openURL(url);
      return;
    }
    if (quickAction.kind === "run_pull") {
      const client = getClient(environmentId);
      if (!client || !cwd) {
        toast.show({
          variant: "danger",
          label: "Live connection required",
          description: "Reconnect the environment before pulling repository changes.",
        });
        return;
      }
      setOperationLabel("Pulling latest changes");
      try {
        await client.vcs.pull({ cwd });
        await git.refresh();
        toast.show({
          variant: "success",
          label: "Repository updated",
          description: "Pulled the latest repository changes.",
        });
      } catch (error) {
        toast.show({
          variant: "danger",
          label: "Pull failed",
          description: error instanceof Error ? error.message : "Unable to pull.",
        });
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
        toast.show({
          variant: "warning",
          label: "No files selected",
          description: "Select at least one changed file before committing.",
        });
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
    toast,
  ]);

  return (
    <Screen>
      <View className="flex-row items-center gap-3 border-b border-divider px-4 pb-3 pt-1">
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full bg-default"
        >
          <AppIcon name="back" size={21} color={isDark ? "#f5f5f5" : "#262626"} />
        </Pressable>
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
        style={{ flex: 1 }}
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
            <Card.Body className="gap-4">
              <View className="flex-row items-center justify-between gap-3">
                <View className="min-w-0 flex-1 gap-1">
                  <Card.Title>Files</Card.Title>
                  <Card.Description>
                    {selectedFiles.length} selected · +{selectedInsertions} / -{selectedDeletions}
                  </Card.Description>
                </View>
                <View className="flex-row items-center gap-2">
                  {!allFilesSelected && isEditingFiles ? (
                    <Pressable
                      onPress={() => setExcludedFiles(new Set())}
                      className="rounded-full bg-default px-3 py-2"
                    >
                      <Text className="text-[11px] font-bold uppercase text-foreground">Reset</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={() => setIsEditingFiles((current) => !current)}
                    className="rounded-full bg-default px-3 py-2"
                  >
                    <Text className="text-[11px] font-bold uppercase text-foreground">
                      {isEditingFiles ? "Done" : "Edit"}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {!isEditingFiles ? (
                <View className="gap-2">
                  {selectedFilePreview.map((file) => (
                    <View key={file.path} className="flex-row items-center gap-3 py-1">
                      <View className="h-8 w-8 items-center justify-center rounded-lg bg-default">
                        <AppIcon name="file" size={15} color={isDark ? "#a3a3a3" : "#525252"} />
                      </View>
                      <Text
                        className="min-w-0 flex-1 text-sm font-medium text-foreground"
                        numberOfLines={1}
                      >
                        {file.path}
                      </Text>
                      <Text className="text-xs font-bold text-success">+{file.insertions}</Text>
                      <Text className="text-xs font-bold text-danger">-{file.deletions}</Text>
                    </View>
                  ))}
                  {selectedFiles.length > selectedFilePreview.length ? (
                    <Text className="text-xs text-muted">
                      +{selectedFiles.length - selectedFilePreview.length} more files
                    </Text>
                  ) : null}
                  {selectedFiles.length === 0 ? (
                    <Text className="text-sm leading-5 text-muted">
                      No files selected for the next commit.
                    </Text>
                  ) : null}
                </View>
              ) : (
                <View className="gap-2">
                  {files.map((file) => {
                    const included = !excludedFiles.has(file.path);
                    return (
                      <Pressable
                        key={file.path}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: included }}
                        onPress={() =>
                          setExcludedFiles((current) => {
                            const next = new Set(current);
                            if (included) next.add(file.path);
                            else next.delete(file.path);
                            return next;
                          })
                        }
                        className={`rounded-2xl border px-4 py-3 ${
                          included ? "border-border bg-surface" : "border-separator bg-default"
                        }`}
                      >
                        <View className="flex-row items-start gap-3">
                          <View
                            className={`mt-0.5 h-5 w-5 items-center justify-center rounded-md border ${
                              included ? "border-accent bg-accent" : "border-border bg-background"
                            }`}
                          >
                            {included ? (
                              <Text className="text-xs font-bold text-white">✓</Text>
                            ) : null}
                          </View>
                          <View className="min-w-0 flex-1 gap-1">
                            <Text
                              selectable
                              className={`text-sm font-semibold ${
                                included ? "text-foreground" : "text-muted"
                              }`}
                            >
                              {file.path}
                            </Text>
                            {!included ? (
                              <Text className="text-xs text-muted">Excluded from this commit</Text>
                            ) : null}
                          </View>
                          <View className="items-end gap-1">
                            <Text className="text-xs font-bold text-success">
                              +{file.insertions}
                            </Text>
                            <Text className="text-xs font-bold text-danger">-{file.deletions}</Text>
                          </View>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}
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
