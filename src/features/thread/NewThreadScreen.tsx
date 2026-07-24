import {
  CommandId,
  MessageId,
  ThreadId,
  type VcsRef,
  type ModelSelection,
} from "@t3tools/contracts";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/AppIcon";
import { ConnectionStatusIndicator } from "@/components/ConnectionStatusIndicator";
import { connectionStatusFromEnvironment } from "@/components/connectionStatus";
import { BlurScreenRoot, HeaderBubble } from "@/components/chrome";
import { useChromeTheme } from "@/components/chrome/useChromeTheme";
import { FloatingBottomChrome } from "@/components/FloatingBottomChrome";
import { ProviderIcon } from "@/components/ProviderIcon";
import { Screen } from "@/components/Screen";
import { useEnvironments } from "@/runtime/EnvironmentProvider";
import { usePreferences } from "@/runtime/PreferencesProvider";
import { useServerSettings } from "@/runtime/useServerSettings";
import { estimatedComposerChromeHeight } from "@/utils/bottomChrome";
import { newId } from "@/utils/id";
import { randomHex } from "@/utils/randomHex";
import {
  BranchSelectorDrawer,
  ModelSelectorDrawer,
  ThinkingOptionsDrawer,
  type BranchOption,
} from "./ComposerSelectors";
import { buildNewThreadTurnStartCommand, validateNewThreadSubmit } from "./newThreadCommand";
import {
  buildModelOptions,
  getDescriptorDefaultValue,
  getModelSelectionOption,
  normalizeModelSelection,
  setModelSelectionOption,
  thinkingOptionDescriptors,
  type ModelOption,
} from "./modelOptions";
import { pickImageAttachments } from "./imageAttachmentPicker";
import type { SelectedImageAttachment } from "./messageAttachments";

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

function ComposerImageAttachment({
  attachment,
  onRemove,
}: {
  readonly attachment: SelectedImageAttachment;
  readonly onRemove: () => void;
}) {
  const isDark = useColorScheme() === "dark";

  return (
    <View className="relative h-16 w-16 overflow-hidden rounded-2xl bg-surface-secondary">
      <Image
        accessibilityLabel={attachment.name}
        source={{ uri: attachment.previewUri }}
        contentFit="cover"
        style={{ height: "100%", width: "100%" }}
      />
      <Pressable
        accessibilityLabel={`Remove ${attachment.name}`}
        accessibilityRole="button"
        onPress={onRemove}
        className="absolute right-1 top-1 h-6 w-6 items-center justify-center rounded-full bg-black/70"
      >
        <AppIcon name="x" size={14} color="#ffffff" strokeWidth={2.5} />
      </Pressable>
      <View
        pointerEvents="none"
        className="absolute inset-0 rounded-2xl border"
        style={{ borderColor: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.08)" }}
      />
    </View>
  );
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
  const connectionStatus = useMemo(
    () =>
      connectionStatusFromEnvironment({
        connectionState: environment?.connectionState ?? "disconnected",
        connectionStep: environment?.connectionStep ?? "offline",
        dataSource: environment?.dataSource ?? "none",
      }),
    [environment?.connectionState, environment?.connectionStep, environment?.dataSource]
  );
  const { preferences } = usePreferences();
  const defaultThreadModelSelection = preferences.defaultThreadModelSelection;
  const { settings } = useServerSettings(project?.environmentId);
  const modelOptions = useMemo(
    () =>
      buildModelOptions(
        environment?.serverConfig,
        defaultThreadModelSelection ?? project?.defaultModelSelection ?? null
      ),
    [defaultThreadModelSelection, environment?.serverConfig, project?.defaultModelSelection]
  );
  const initialModelSelection =
    defaultThreadModelSelection ??
    project?.defaultModelSelection ??
    modelOptions[0]?.selection ??
    null;
  const [prompt, setPrompt] = useState("");
  const [selectedAttachments, setSelectedAttachments] = useState<
    readonly SelectedImageAttachment[]
  >([]);
  const [selectedModel, setSelectedModel] = useState<ModelSelection | null>(initialModelSelection);
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
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [bottomChromeHeight, setBottomChromeHeight] = useState(() =>
    estimatedComposerChromeHeight(insets)
  );
  const [headerHeight, setHeaderHeight] = useState(insets.top + 52);
  const theme = useChromeTheme();
  const branchEditedRef = useRef(false);
  const modeEditedRef = useRef(false);
  const modelEditedRef = useRef(false);
  const selectedOption =
    modelOptions.find(
      (option) =>
        selectedModel &&
        option.selection.instanceId === selectedModel.instanceId &&
        option.selection.model === selectedModel.model
    ) ?? null;
  const thinkingDescriptors = thinkingOptionDescriptors(selectedOption);
  const canSubmit = Boolean(
    project && selectedModel && (prompt.trim() || selectedAttachments.length > 0) && !submitting
  );
  const branchOptions = useMemo(
    () => toBranchOptions(branchRefs, selectedBranch),
    [branchRefs, selectedBranch]
  );

  useEffect(() => {
    if (!modelEditedRef.current || !selectedModel) {
      setSelectedModel(initialModelSelection);
    }
  }, [initialModelSelection, selectedModel]);

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
    modelEditedRef.current = true;
    setSelectedModel(option.selection);
    setModelDrawerOpen(false);
  }, []);

  const selectThinkingOption = useCallback((id: string, value: string | boolean) => {
    modelEditedRef.current = true;
    setSelectedModel((current) =>
      current ? setModelSelectionOption(current, id, value) : current
    );
  }, []);

  const selectBranch = useCallback((branch: string) => {
    branchEditedRef.current = true;
    setSelectedBranch(branch);
    setBranchDrawerOpen(false);
  }, []);

  const addImages = useCallback(async () => {
    setAttachmentError(null);
    const result = await pickImageAttachments({ existingCount: selectedAttachments.length });
    if (result.kind === "selected") {
      setSelectedAttachments((current) => [...current, ...result.attachments]);
      return;
    }
    if (result.kind === "error" || result.kind === "denied") {
      setAttachmentError(result.message);
    }
  }, [selectedAttachments.length]);

  const removeAttachment = useCallback((key: string) => {
    setSelectedAttachments((current) => current.filter((attachment) => attachment.key !== key));
    setAttachmentError(null);
  }, []);

  const submit = useCallback(async () => {
    if (
      !project ||
      !selectedModel ||
      (!prompt.trim() && selectedAttachments.length === 0) ||
      submitting
    ) {
      return;
    }
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
    setAttachmentError(null);
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
          attachments: selectedAttachments.map((attachment) => attachment.upload),
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
    selectedAttachments,
    selectedModel,
    submitting,
    threadEnvMode,
  ]);

  if (!project) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center gap-3 px-6">
          <Text className="text-[17px] font-bold text-foreground">Project unavailable</Text>
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
    <Screen edges={["left", "right"]}>
      <BlurScreenRoot
        onHeaderHeightChange={setHeaderHeight}
        header={
          <>
            <HeaderBubble accessibilityLabel="Go back" onPress={() => router.back()} variant="icon">
              <AppIcon name="back" size={21} color={theme.foreground} />
            </HeaderBubble>
            <HeaderBubble variant="title">
              <View style={{ gap: 2, minWidth: 0 }}>
                <Text
                  numberOfLines={1}
                  style={{
                    color: theme.foreground,
                    fontSize: 15,
                    fontWeight: "600",
                    lineHeight: 17,
                  }}
                >
                  New thread
                </Text>
                <View className="flex-row items-center gap-1.5" style={{ minWidth: 0 }}>
                  <ConnectionStatusIndicator status={connectionStatus} compact />
                  <Text
                    numberOfLines={1}
                    style={{ color: theme.muted, fontSize: 10, lineHeight: 12, flexShrink: 1 }}
                  >
                    · {project.title}
                  </Text>
                </View>
              </View>
            </HeaderBubble>
          </>
        }
        footer={
          <FloatingBottomChrome onHeightChange={setBottomChromeHeight}>
          {error || attachmentError ? (
            <View className="mb-2 rounded-xl bg-danger-soft px-3 py-2">
              <Text className="text-xs leading-5 text-danger">{error ?? attachmentError}</Text>
            </View>
          ) : null}
          {selectedAttachments.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="mb-2"
              contentContainerStyle={{ gap: 8 }}
            >
              {selectedAttachments.map((attachment) => (
                <ComposerImageAttachment
                  key={attachment.key}
                  attachment={attachment}
                  onRemove={() => removeAttachment(attachment.key)}
                />
              ))}
            </ScrollView>
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
          <View className="flex-row items-center gap-1.5">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Attach images"
              onPress={() => void addImages()}
              className="h-8 w-8 items-center justify-center rounded-full bg-default"
            >
              <AppIcon name="image" size={16} color={isDark ? "#d4d4d4" : "#525252"} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Select branch"
              onPress={() => setBranchDrawerOpen(true)}
              className="min-w-0 flex-[1.05] flex-row items-center gap-1.5 rounded-full bg-default px-2.5 py-2.5"
            >
              <AppIcon name="branch" size={15} color={isDark ? "#d4d4d4" : "#525252"} />
              <Text
                className="min-w-0 flex-1 text-xs font-semibold text-foreground"
                numberOfLines={1}
              >
                {selectedBranch || "Branch"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Select model"
              onPress={() => setModelDrawerOpen(true)}
              className="h-10 min-w-10 flex-[0.72] flex-row items-center justify-center gap-1 rounded-full bg-default px-2"
            >
              <ProviderIcon
                driver={selectedOption?.providerDriver ?? selectedModel?.instanceId ?? ""}
                label={selectedOption?.providerLabel ?? selectedModel?.model ?? "AI"}
                size={18}
              />
              <Text className="min-w-0 flex-1 text-xs font-semibold text-foreground" numberOfLines={1}>
                {selectedModel?.model ?? "Model"}
              </Text>
            </Pressable>
            {thinkingDescriptors.length > 0 ? (
              <Pressable
                onPress={() => setThinkingDrawerOpen(true)}
                className="h-10 min-w-0 flex-[0.82] justify-center rounded-full bg-default px-2.5"
              >
                <Text className="text-center text-xs font-semibold text-muted" numberOfLines={1}>
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
              className={`h-8 w-8 items-center justify-center rounded-full ${
                canSubmit ? "bg-accent" : "bg-default"
              }`}
            >
              {submitting ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <AppIcon
                  name="arrow-up"
                  size={18}
                  color={canSubmit ? "#ffffff" : isDark ? "#737373" : "#a3a3a3"}
                />
              )}
            </Pressable>
          </View>
        </FloatingBottomChrome>
        }
      >
        <TextInput
          autoFocus
          multiline
          scrollEnabled
          value={prompt}
          onChangeText={setPrompt}
          placeholder={`Describe a coding task in ${project.title}`}
          placeholderTextColor={isDark ? "#737373" : "#9a9a9a"}
          selectionColor={isDark ? "#60a5fa" : "#2563eb"}
          textAlignVertical="top"
          className="flex-1 px-4 py-4 text-[14px] leading-5 text-foreground"
          style={{
            paddingBottom: bottomChromeHeight + 12,
            paddingTop: headerHeight + 4,
            width: "100%",
          }}
        />
      </BlurScreenRoot>

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
