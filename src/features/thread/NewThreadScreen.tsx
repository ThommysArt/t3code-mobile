import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  MessageId,
  ThreadId,
  type VcsRef,
  type ModelSelection,
} from "@t3tools/contracts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/AppIcon";
import { ProviderIcon } from "@/components/ProviderIcon";
import { Screen } from "@/components/Screen";
import { useEnvironments } from "@/runtime/EnvironmentProvider";
import { useServerSettings } from "@/runtime/useServerSettings";
import { newId } from "@/utils/id";
import { randomHex } from "@/utils/randomHex";
import {
  BranchSelectorDrawer,
  ModelSelectorDrawer,
  ThinkingOptionsDrawer,
  type BranchOption,
} from "./ComposerSelectors";
import {
  buildNewThreadTurnStartCommand,
  validateNewThreadSubmit,
} from "./newThreadCommand";
import {
  buildModelOptions,
  getDescriptorDefaultValue,
  getModelSelectionOption,
  normalizeModelSelection,
  setModelSelectionOption,
  thinkingOptionDescriptors,
  type ModelOption,
} from "./modelOptions";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function titleFromPrompt(prompt: string): string {
  const compact = prompt.trim().replace(/\s+/g, " ");
  if (!compact) return "New thread";
  return compact.length <= 72 ? compact : `${compact.slice(0, 69).trimEnd()}...`;
}

type ThreadEnvMode = "local" | "worktree";

function branchDetail(ref: VcsRef): string | null {
  const labels = [
    ref.current ? "Current" : null,
    ref.isDefault ? "Default" : null,
    ref.isRemote ? (ref.remoteName ?? "Remote") : "Local",
    ref.worktreePath ? "Checked out" : null,
  ].filter((label): label is string => Boolean(label));
  return labels.length > 0 ? labels.join(" · ") : null;
}

function toBranchOptions(refs: readonly VcsRef[], selectedBranch: string): readonly BranchOption[] {
  const seen = new Set<string>();
  const options: BranchOption[] = [];
  for (const ref of refs) {
    if (seen.has(ref.name)) continue;
    seen.add(ref.name);
    options.push({
      name: ref.name,
      detail: branchDetail(ref),
      current: ref.current,
      isDefault: ref.isDefault,
    });
  }
  if (selectedBranch.trim() && !seen.has(selectedBranch.trim())) {
    options.unshift({
      name: selectedBranch.trim(),
      detail: "Selected",
      current: false,
      isDefault: false,
    });
  }
  return options;
}

export function NewThreadScreen() {
  const params = useLocalSearchParams<{
    environmentId?: string | string[];
    projectId?: string | string[];
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const environmentId = firstParam(params.environmentId);
  const projectId = firstParam(params.projectId);
  const { dispatchCommand, getClient, getEnvironment, projects } = useEnvironments();
  const project =
    projects.find(
      (candidate) => candidate.environmentId === environmentId && candidate.id === projectId
    ) ?? null;
  const environment = project ? getEnvironment(project.environmentId) : null;
  const { settings } = useServerSettings(project?.environmentId);
  const modelOptions = useMemo(
    () => buildModelOptions(environment?.serverConfig, project?.defaultModelSelection ?? null),
    [environment?.serverConfig, project?.defaultModelSelection]
  );
  const [prompt, setPrompt] = useState("");
  const [selectedModel, setSelectedModel] = useState<ModelSelection | null>(
    project?.defaultModelSelection ?? modelOptions[0]?.selection ?? null
  );
  const [modelDrawerOpen, setModelDrawerOpen] = useState(false);
  const [thinkingDrawerOpen, setThinkingDrawerOpen] = useState(false);
  const [branchDrawerOpen, setBranchDrawerOpen] = useState(false);
  const [threadEnvMode, setThreadEnvMode] = useState<ThreadEnvMode>("local");
  const [selectedBranch, setSelectedBranch] = useState("main");
  const [branchRefs, setBranchRefs] = useState<readonly VcsRef[]>([]);
  const [branchPending, setBranchPending] = useState(false);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const branchEditedRef = useRef(false);
  const modeEditedRef = useRef(false);
  const selectedOption =
    modelOptions.find(
      (option) =>
        selectedModel &&
        option.selection.instanceId === selectedModel.instanceId &&
        option.selection.model === selectedModel.model
    ) ?? null;
  const thinkingDescriptors = thinkingOptionDescriptors(selectedOption);
  const canSubmit = Boolean(project && selectedModel && prompt.trim() && !submitting);
  const branchOptions = useMemo(
    () => toBranchOptions(branchRefs, selectedBranch),
    [branchRefs, selectedBranch]
  );

  useEffect(() => {
    if (!selectedModel) {
      setSelectedModel(project?.defaultModelSelection ?? modelOptions[0]?.selection ?? null);
    }
  }, [modelOptions, project?.defaultModelSelection, selectedModel]);

  useEffect(() => {
    if (!settings?.defaultThreadEnvMode || modeEditedRef.current) return;
    setThreadEnvMode(settings.defaultThreadEnvMode);
  }, [settings?.defaultThreadEnvMode]);

  useEffect(() => {
    if (!project) return;
    let active = true;
    const client = getClient(project.environmentId);
    if (!client) {
      setBranchPending(false);
      setBranchError("Live connection required to load branches.");
      return;
    }

    setBranchPending(true);
    setBranchError(null);
    void client.vcs
      .listRefs({ cwd: project.workspaceRoot, limit: 50 })
      .then((result) => {
        if (!active) return;
        setBranchRefs(result.refs);
        if (!branchEditedRef.current) {
          const preferred =
            result.refs.find((ref) => ref.current)?.name ??
            result.refs.find((ref) => ref.isDefault)?.name ??
            result.refs[0]?.name;
          if (preferred) setSelectedBranch(preferred);
        }
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setBranchError(loadError instanceof Error ? loadError.message : "Unable to load branches.");
      })
      .finally(() => {
        if (active) setBranchPending(false);
      });

    return () => {
      active = false;
    };
  }, [environment?.sessionRevision, getClient, project]);

  const selectModel = useCallback((option: ModelOption) => {
    setSelectedModel(option.selection);
    setModelDrawerOpen(false);
  }, []);

  const selectThinkingOption = useCallback((id: string, value: string | boolean) => {
    setSelectedModel((current) =>
      current ? setModelSelectionOption(current, id, value) : current
    );
  }, []);

  const selectBranch = useCallback((branch: string) => {
    branchEditedRef.current = true;
    setSelectedBranch(branch);
    setBranchDrawerOpen(false);
  }, []);

  const submit = useCallback(async () => {
    if (!project || !selectedModel || !prompt.trim() || submitting) return;
    const branch = selectedBranch.trim() || null;
    const validationError = validateNewThreadSubmit({
      envMode: threadEnvMode,
      branch,
    });
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    setError(null);
    const threadId = ThreadId.make(newId());
    const createdAt = new Date().toISOString();
    const title = titleFromPrompt(prompt);
    const modelSelection = normalizeModelSelection(selectedModel);
    try {
      await dispatchCommand(
        project.environmentId,
        buildNewThreadTurnStartCommand({
          commandId: CommandId.make(newId()),
          threadId,
          messageId: MessageId.make(newId()),
          projectId: project.id,
          projectCwd: project.workspaceRoot,
          title,
          prompt,
          modelSelection,
          branch,
          envMode: threadEnvMode,
          createdAt,
          randomHex,
        })
      );
      router.replace({
        pathname: "/threads/[environmentId]/[threadId]",
        params: { environmentId: project.environmentId, threadId },
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create the thread.");
      setSubmitting(false);
    }
  }, [
    dispatchCommand,
    project,
    prompt,
    router,
    selectedBranch,
    selectedModel,
    submitting,
    threadEnvMode,
  ]);

  if (!project) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Text className="text-lg font-bold text-foreground">Project unavailable</Text>
          <Pressable onPress={() => router.back()} className="rounded-full bg-default px-4 py-2.5">
            <Text className="font-semibold text-foreground">Go back</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  const firstThinkingDescriptor = thinkingDescriptors[0];
  const thinkingValue =
    firstThinkingDescriptor && selectedModel
      ? (getModelSelectionOption(selectedModel, firstThinkingDescriptor.id) ??
        getDescriptorDefaultValue(firstThinkingDescriptor))
      : undefined;

  return (
    <Screen edges={["top", "left", "right"]}>
      <View className="flex-row items-center gap-3 border-b border-separator px-3 pb-3 pt-2">
        <Pressable
          onPress={() => router.back()}
          className="h-10 w-10 items-center justify-center rounded-full bg-default"
        >
          <AppIcon name="back" size={21} color={isDark ? "#f5f5f5" : "#262626"} />
        </Pressable>
        <View className="flex-1">
          <Text className="text-[17px] font-bold text-foreground" numberOfLines={1}>
            New thread
          </Text>
          <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
            {project.title}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TextInput
          autoFocus
          multiline
          value={prompt}
          onChangeText={setPrompt}
          placeholder={`Describe a coding task in ${project.title}`}
          placeholderTextColor={isDark ? "#737373" : "#9a9a9a"}
          textAlignVertical="top"
          className="flex-1 px-5 py-5 text-[18px] leading-7 text-foreground"
        />
        <View
          className="border-t border-separator bg-background px-3 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 8) }}
        >
          {error ? (
            <View className="mb-2 rounded-xl bg-danger-soft px-3 py-2">
              <Text className="text-xs leading-5 text-danger">{error}</Text>
            </View>
          ) : null}
          <View className="mb-2 flex-row items-center gap-2">
            {(["local", "worktree"] as const).map((mode) => {
              const active = threadEnvMode === mode;
              return (
                <Pressable
                  key={mode}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    modeEditedRef.current = true;
                    setThreadEnvMode(mode);
                  }}
                  className={`flex-1 rounded-full px-3 py-2.5 ${
                    active ? "bg-default" : "border border-border bg-surface"
                  }`}
                >
                  <Text
                    className={`text-center text-xs font-semibold ${
                      active ? "text-foreground" : "text-muted"
                    }`}
                    numberOfLines={1}
                  >
                    {mode === "local" ? "Local checkout" : "New worktree"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View className="flex-row items-center gap-2">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Select branch"
              onPress={() => setBranchDrawerOpen(true)}
              className="max-w-[34%] flex-row items-center gap-2 rounded-full bg-default px-3 py-3"
            >
              <AppIcon name="branch" size={16} color={isDark ? "#d4d4d4" : "#525252"} />
              <Text
                className="min-w-0 flex-1 text-sm font-semibold text-foreground"
                numberOfLines={1}
              >
                {selectedBranch || "Branch"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setModelDrawerOpen(true)}
              className="min-w-0 flex-1 flex-row items-center gap-2 rounded-full bg-default px-4 py-3"
            >
              <ProviderIcon
                driver={selectedOption?.providerDriver ?? selectedModel?.instanceId ?? ""}
                label={selectedOption?.providerLabel ?? selectedModel?.model ?? "AI"}
                size={19}
              />
              <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                {selectedOption?.label ?? selectedModel?.model ?? "Select model"}
              </Text>
            </Pressable>
            {thinkingDescriptors.length > 0 ? (
              <Pressable
                onPress={() => setThinkingDrawerOpen(true)}
                className="max-w-[32%] rounded-full bg-default px-4 py-3"
              >
                <Text className="text-sm font-semibold text-muted" numberOfLines={1}>
                  {typeof thinkingValue === "string"
                    ? thinkingValue
                    : typeof thinkingValue === "boolean"
                      ? thinkingValue
                        ? "Thinking on"
                        : "Thinking off"
                      : "Thinking"}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              disabled={!canSubmit}
              onPress={() => void submit()}
              className={`h-12 w-12 items-center justify-center rounded-full ${
                canSubmit ? "bg-accent" : "bg-default"
              }`}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <AppIcon
                  name="arrow-up"
                  size={21}
                  color={canSubmit ? "#ffffff" : isDark ? "#737373" : "#a3a3a3"}
                />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {selectedModel ? (
        <ModelSelectorDrawer
          lockedProvider={false}
          options={modelOptions}
          selected={selectedModel}
          visible={modelDrawerOpen}
          onClose={() => setModelDrawerOpen(false)}
          onSelect={selectModel}
        />
      ) : null}
      {selectedModel && thinkingDescriptors.length > 0 ? (
        <ThinkingOptionsDrawer
          descriptors={thinkingDescriptors}
          selection={selectedModel}
          visible={thinkingDrawerOpen}
          onClose={() => setThinkingDrawerOpen(false)}
          onSelect={selectThinkingOption}
        />
      ) : null}
      <BranchSelectorDrawer
        error={branchError}
        isPending={branchPending}
        options={branchOptions}
        selectedBranch={selectedBranch}
        visible={branchDrawerOpen}
        onClose={() => setBranchDrawerOpen(false)}
        onSelect={selectBranch}
      />
    </Screen>
  );
}
