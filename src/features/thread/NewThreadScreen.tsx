import {
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  MessageId,
  ThreadId,
  type ModelSelection,
} from "@t3tools/contracts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Screen } from "@/components/Screen";
import { useEnvironments } from "@/runtime/EnvironmentProvider";
import { newId } from "@/utils/id";
import { ModelSelectorDrawer, ThinkingOptionsDrawer } from "./ComposerSelectors";
import {
  buildModelOptions,
  getDescriptorDefaultValue,
  getModelSelectionOption,
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
  const { dispatchCommand, getEnvironment, projects } = useEnvironments();
  const project =
    projects.find(
      (candidate) => candidate.environmentId === environmentId && candidate.id === projectId
    ) ?? null;
  const environment = project ? getEnvironment(project.environmentId) : null;
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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedOption =
    modelOptions.find(
      (option) =>
        selectedModel &&
        option.selection.instanceId === selectedModel.instanceId &&
        option.selection.model === selectedModel.model
    ) ?? null;
  const thinkingDescriptors = thinkingOptionDescriptors(selectedOption);
  const canSubmit = Boolean(project && selectedModel && prompt.trim() && !submitting);

  useEffect(() => {
    if (!selectedModel) {
      setSelectedModel(project?.defaultModelSelection ?? modelOptions[0]?.selection ?? null);
    }
  }, [modelOptions, project?.defaultModelSelection, selectedModel]);

  const selectModel = useCallback((option: ModelOption) => {
    setSelectedModel(option.selection);
    setModelDrawerOpen(false);
  }, []);

  const selectThinkingOption = useCallback((id: string, value: string | boolean) => {
    setSelectedModel((current) =>
      current ? setModelSelectionOption(current, id, value) : current
    );
  }, []);

  const submit = useCallback(async () => {
    if (!project || !selectedModel || !prompt.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    const threadId = ThreadId.make(newId());
    const createdAt = new Date().toISOString();
    const title = titleFromPrompt(prompt);
    try {
      await dispatchCommand(project.environmentId, {
        type: "thread.turn.start",
        commandId: CommandId.make(newId()),
        threadId,
        message: {
          messageId: MessageId.make(newId()),
          role: "user",
          text: prompt.trim(),
          attachments: [],
        },
        modelSelection: selectedModel,
        titleSeed: title,
        runtimeMode: DEFAULT_RUNTIME_MODE,
        interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
        bootstrap: {
          createThread: {
            projectId: project.id,
            title,
            modelSelection: selectedModel,
            runtimeMode: DEFAULT_RUNTIME_MODE,
            interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
            branch: null,
            worktreePath: null,
            createdAt,
          },
        },
        createdAt,
      });
      router.replace({
        pathname: "/threads/[environmentId]/[threadId]",
        params: { environmentId: project.environmentId, threadId },
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create the thread.");
      setSubmitting(false);
    }
  }, [dispatchCommand, project, prompt, router, selectedModel, submitting]);

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
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => setModelDrawerOpen(true)}
              className="min-w-0 flex-1 rounded-full bg-default px-4 py-3"
            >
              <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
                {selectedOption?.label ?? selectedModel?.model ?? "Select model"}
              </Text>
            </Pressable>
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
      {selectedModel ? (
        <ThinkingOptionsDrawer
          descriptors={thinkingDescriptors}
          selection={selectedModel}
          visible={thinkingDrawerOpen}
          onClose={() => setThinkingDrawerOpen(false)}
          onSelect={selectThinkingOption}
        />
      ) : null}
    </Screen>
  );
}
