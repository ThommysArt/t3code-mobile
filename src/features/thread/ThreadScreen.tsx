import type { ModelSelection, OrchestrationMessage } from "@t3tools/contracts";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/AppIcon";
import { Screen } from "@/components/Screen";
import { loadThreadDraft, saveThreadDraft } from "@/runtime/db";
import { useThread } from "@/runtime/useThread";
import { relativeTime } from "@/utils/time";
import { attachmentHeaders, messageImageUrl } from "./messageAttachments";
import { MarkdownContent } from "./MarkdownContent";
import { ModelSelectorDrawer, ThinkingOptionsDrawer } from "./ComposerSelectors";
import { COLLAPSED_PROMPT_HEIGHT, shouldCollapsePrompt } from "./messageDisplay";
import {
  buildModelOptions,
  getDescriptorDefaultValue,
  getModelSelectionOption,
  modelOptionsForConversation,
  setModelSelectionOption,
  thinkingOptionDescriptors,
  type ModelOption,
} from "./modelOptions";
import { buildThreadFeed, formatWorkDuration, type ThreadFeedEntry } from "./threadFeed";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function MessageAttachment({
  headers,
  name,
  uri,
}: {
  readonly headers: Readonly<Record<string, string>> | undefined;
  readonly name: string;
  readonly uri: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  return (
    <View
      className="mb-2.5 w-full overflow-hidden rounded-2xl bg-surface-secondary"
      style={{ aspectRatio: 1.3 }}
    >
      {failed ? (
        <View className="flex-1 items-center justify-center gap-2 px-4">
          <Text className="text-center text-xs text-muted">Unable to load {name}</Text>
        </View>
      ) : (
        <>
          <Image
            accessibilityLabel={name}
            source={{ uri, ...(headers ? { headers: { ...headers } } : {}) }}
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={150}
            style={{ height: "100%", width: "100%" }}
            onLoadStart={() => {
              setFailed(false);
              setLoading(true);
            }}
            onLoad={() => setLoading(false)}
            onError={() => {
              setFailed(true);
              setLoading(false);
            }}
          />
          {loading ? (
            <View className="absolute inset-0 items-center justify-center">
              <ActivityIndicator color="#f97316" />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function MessageRow({
  bearerToken,
  httpBaseUrl,
  message,
}: {
  readonly bearerToken: string | null;
  readonly httpBaseUrl: string | null;
  readonly message: OrchestrationMessage & { optimistic?: true };
}) {
  const isUser = message.role === "user";
  const isDark = useColorScheme() === "dark";
  const [expanded, setExpanded] = useState(false);
  const attachments = message.attachments ?? [];
  const collapsible = isUser && shouldCollapsePrompt(message.text);
  if (!message.text.trim() && attachments.length === 0) return null;
  const headers = attachmentHeaders(bearerToken);

  return (
    <View className={isUser ? "items-end" : "items-stretch"}>
      <View
        className={
          isUser
            ? `${attachments.length > 0 ? "w-[88%]" : "max-w-[88%]"} rounded-[24px] rounded-br-md bg-default px-4 py-3`
            : "w-full px-1 py-1"
        }
      >
        {attachments.map((attachment) => {
          const uri = messageImageUrl(httpBaseUrl, attachment.id);
          if (!uri) return null;
          return (
            <MessageAttachment
              key={attachment.id}
              headers={headers}
              name={attachment.name}
              uri={uri}
            />
          );
        })}
        {message.text.trim() ? (
          <>
            <View
              className="relative overflow-hidden"
              style={collapsible && !expanded ? { maxHeight: COLLAPSED_PROMPT_HEIGHT } : undefined}
            >
              <MarkdownContent text={message.text} />
              {collapsible && !expanded ? (
                <View
                  pointerEvents="none"
                  className="absolute inset-x-0 bottom-0 h-9 items-center justify-end"
                  style={{ backgroundColor: isDark ? "#262626" : "#e9e9ec" }}
                >
                  <Text className="pb-0.5 text-base font-bold text-muted">...</Text>
                </View>
              ) : null}
            </View>
            {collapsible ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                hitSlop={8}
                onPress={() => setExpanded((current) => !current)}
                className="self-end px-1 pt-1.5"
              >
                <Text className="text-xs font-semibold text-muted">
                  {expanded ? "Show less" : "Show more"}
                </Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </View>
      <Text className="mt-1 px-1 text-[11px] text-muted">
        {message.optimistic ? "Queued" : relativeTime(message.createdAt)}
        {message.streaming ? " · live" : ""}
      </Text>
    </View>
  );
}

function WorkLogGroup({
  entry,
  expanded,
  onToggle,
}: {
  readonly entry: Extract<ThreadFeedEntry, { type: "work-log" }>;
  readonly expanded: boolean;
  readonly onToggle: () => void;
}) {
  const isDark = useColorScheme() === "dark";

  return (
    <View className="overflow-hidden rounded-2xl border border-border bg-surface">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        className="flex-row items-center gap-2 px-4 py-3"
      >
        <Text className="flex-1 text-sm font-medium text-muted">
          Worked for {formatWorkDuration(entry.startedAt, entry.completedAt)}
        </Text>
        <View style={{ transform: [{ rotate: expanded ? "180deg" : "-90deg" }] }}>
          <AppIcon name="chevron-down" size={16} color={isDark ? "#858585" : "#737373"} />
        </View>
      </Pressable>
      {expanded ? (
        <View className="border-t border-separator px-3 py-1">
          {entry.rows.map((row, index) => (
            <View
              key={row.id}
              className={`flex-row gap-3 px-1 py-2.5 ${
                index > 0 ? "border-t border-separator" : ""
              }`}
            >
              <View
                className={`mt-1.5 h-2 w-2 rounded-full ${
                  row.tone === "error"
                    ? "bg-danger"
                    : row.tone === "tool"
                      ? "bg-accent"
                      : "bg-muted"
                }`}
              />
              <View className="flex-1">
                <MarkdownContent compact text={row.summary} />
                {row.detail ? (
                  <View className="mt-1">
                    <MarkdownContent compact text={row.detail} />
                  </View>
                ) : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ThreadScreen() {
  const params = useLocalSearchParams<{
    environmentId?: string | string[];
    threadId?: string | string[];
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const environmentId = firstParam(params.environmentId);
  const threadId = firstParam(params.threadId);
  const {
    cachedReceivedAt,
    clearSendError,
    connectionState,
    dataSource,
    error,
    bearerToken,
    httpBaseUrl,
    isCached,
    isPending,
    messages,
    refresh,
    sendError,
    sendMessage,
    serverConfig,
    shell,
    thread,
    updateModelSelection,
  } = useThread(environmentId, threadId);
  const [draft, setDraft] = useState("");
  const draftRef = useRef("");
  const draftEditedRef = useRef(false);
  const draftHydratedRef = useRef(false);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [thinkingSelectorOpen, setThinkingSelectorOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelSelection | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [expandedWorkLogs, setExpandedWorkLogs] = useState<ReadonlySet<string>>(new Set());
  const scrollRef = useRef<ScrollView>(null);
  const feed = useMemo(
    () => buildThreadFeed(messages, thread?.activities ?? []),
    [messages, thread?.activities]
  );
  const busy = thread?.session?.status === "running" || thread?.session?.status === "starting";
  const live = connectionState === "ready";
  const canSend = Boolean(thread && draft.trim());
  const statusLabel = live ? "Live" : dataSource === "http" ? "HTTP sync" : "Offline";
  const statusColor = live ? "#22c55e" : dataSource === "http" ? "#f59e0b" : "#737373";
  const effectiveModel = selectedModel ?? thread?.modelSelection ?? shell?.modelSelection ?? null;
  const allModelOptions = useMemo(
    () => (effectiveModel ? buildModelOptions(serverConfig, effectiveModel) : []),
    [effectiveModel, serverConfig]
  );
  const hasExistingConversation =
    messages.some(
      (message) =>
        message.role === "user" && !("optimistic" in message && message.optimistic === true)
    ) && messages.some((message) => message.role === "assistant");
  const modelOptions = useMemo(
    () => modelOptionsForConversation(allModelOptions, effectiveModel, hasExistingConversation),
    [allModelOptions, effectiveModel, hasExistingConversation]
  );
  const selectedModelOption =
    allModelOptions.find(
      (option) =>
        effectiveModel &&
        option.selection.instanceId === effectiveModel.instanceId &&
        option.selection.model === effectiveModel.model
    ) ?? null;
  const thinkingDescriptors = thinkingOptionDescriptors(selectedModelOption);
  const thinkingLabel = (() => {
    const descriptor = thinkingDescriptors[0];
    if (!descriptor || !effectiveModel) return "Thinking";
    const value =
      getModelSelectionOption(effectiveModel, descriptor.id) ??
      getDescriptorDefaultValue(descriptor);
    if (typeof value === "boolean") return value ? "Thinking on" : "Thinking off";
    if (typeof value === "string") {
      if (descriptor.type === "select") {
        return descriptor.options.find((option) => option.id === value)?.label ?? value;
      }
      return value;
    }
    return descriptor.label;
  })();

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
  }, [feed.length]);

  useEffect(() => {
    if (thread?.modelSelection) setSelectedModel(thread.modelSelection);
  }, [thread?.modelSelection]);

  useEffect(() => {
    let active = true;
    draftHydratedRef.current = false;
    draftEditedRef.current = false;
    draftRef.current = "";
    setDraft("");

    void loadThreadDraft(environmentId, threadId).then((savedDraft) => {
      if (!active) return;
      if (!draftEditedRef.current) {
        draftRef.current = savedDraft;
        setDraft(savedDraft);
      } else {
        void saveThreadDraft(environmentId, threadId, draftRef.current);
      }
      draftHydratedRef.current = true;
    });

    return () => {
      active = false;
      void saveThreadDraft(environmentId, threadId, draftRef.current);
    };
  }, [environmentId, threadId]);

  useEffect(() => {
    if (!draftHydratedRef.current) return;
    const timeout = setTimeout(() => {
      void saveThreadDraft(environmentId, threadId, draft);
    }, 300);
    return () => clearTimeout(timeout);
  }, [draft, environmentId, threadId]);

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text || !effectiveModel) return;
    draftRef.current = "";
    setDraft("");
    void saveThreadDraft(environmentId, threadId, "");
    clearSendError();
    await sendMessage(text, effectiveModel);
  }, [clearSendError, draft, effectiveModel, environmentId, sendMessage, threadId]);

  const selectModel = useCallback(
    (option: ModelOption) => {
      const nextSelection =
        effectiveModel &&
        option.selection.instanceId === effectiveModel.instanceId &&
        option.selection.model === effectiveModel.model
          ? effectiveModel
          : option.selection;
      setSelectedModel(nextSelection);
      setModelError(null);
      setModelSelectorOpen(false);
      void updateModelSelection(nextSelection).catch((selectionError: unknown) => {
        setModelError(
          selectionError instanceof Error ? selectionError.message : "Unable to update the model."
        );
      });
    },
    [effectiveModel, updateModelSelection]
  );

  const selectThinkingOption = useCallback(
    (id: string, value: string | boolean) => {
      if (!effectiveModel) return;
      const nextSelection = setModelSelectionOption(effectiveModel, id, value);
      setSelectedModel(nextSelection);
      setModelError(null);
      void updateModelSelection(nextSelection).catch((selectionError: unknown) => {
        setModelError(
          selectionError instanceof Error
            ? selectionError.message
            : "Unable to update thinking options."
        );
      });
    },
    [effectiveModel, updateModelSelection]
  );

  const toggleWorkLog = useCallback((id: string) => {
    setExpandedWorkLogs((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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
            {thread?.title ?? shell?.title ?? "Thread"}
          </Text>
          <View className="mt-0.5 flex-row items-center gap-1.5">
            <View className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
            <Text className="text-xs text-muted" numberOfLines={1}>
              {statusLabel} · {thread?.branch ?? shell?.branch ?? "main"}
            </Text>
          </View>
        </View>
        <Pressable
          accessibilityLabel="Open source control"
          onPress={() =>
            router.push({
              pathname: "/threads/[environmentId]/[threadId]/git",
              params: { environmentId, threadId },
            })
          }
          className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface"
        >
          <AppIcon name="git" size={20} color={isDark ? "#f5f5f5" : "#262626"} />
        </Pressable>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          style={{ flex: 1 }}
          contentContainerStyle={{
            gap: 22,
            paddingHorizontal: 18,
            paddingBottom: 24,
            paddingTop: 18,
          }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {!live && (isCached || dataSource === "http") ? (
            <View className="flex-row items-start gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
              <View
                className="mt-1 h-2 w-2 rounded-full"
                style={{ backgroundColor: statusColor }}
              />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-foreground">
                  {dataSource === "http"
                    ? "Using authenticated HTTP sync"
                    : "Showing cached history"}
                </Text>
                <Text className="mt-1 text-xs leading-5 text-muted">
                  {dataSource === "http"
                    ? "Prompts remain available. Live updates refresh while the task is running."
                    : `Last synced ${relativeTime(cachedReceivedAt ?? "")}.`}
                </Text>
              </View>
              <Pressable onPress={() => void refresh()} hitSlop={10}>
                <AppIcon name="refresh" size={17} color={isDark ? "#d4d4d4" : "#525252"} />
              </Pressable>
            </View>
          ) : null}

          {error && !thread ? (
            <View className="items-center gap-3 rounded-3xl border border-border bg-surface px-5 py-8">
              <Text className="text-center text-base font-bold text-foreground">
                Thread history unavailable
              </Text>
              <Text className="text-center text-sm leading-6 text-muted">{error}</Text>
              <Pressable
                onPress={() => void refresh()}
                className="flex-row items-center gap-2 rounded-full bg-default px-4 py-2.5"
              >
                <AppIcon name="refresh" size={16} color={isDark ? "#f5f5f5" : "#262626"} />
                <Text className="text-sm font-semibold text-foreground">Refresh</Text>
              </Pressable>
            </View>
          ) : null}

          {isPending && !thread ? (
            <View className="items-center gap-3 py-12">
              <ActivityIndicator color="#f97316" />
              <Text className="text-sm text-muted">Loading thread history</Text>
            </View>
          ) : null}

          {feed.map((entry) =>
            entry.type === "message" ? (
              <MessageRow
                key={entry.id}
                bearerToken={bearerToken}
                httpBaseUrl={httpBaseUrl}
                message={entry.message}
              />
            ) : (
              <WorkLogGroup
                key={entry.id}
                entry={entry}
                expanded={expandedWorkLogs.has(entry.id)}
                onToggle={() => toggleWorkLog(entry.id)}
              />
            )
          )}
        </ScrollView>

        <View
          className="border-t border-separator bg-background px-3 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 8) }}
        >
          {sendError || modelError ? (
            <View className="mb-2 rounded-xl bg-danger-soft px-3 py-2">
              <Text className="text-xs leading-5 text-danger">{sendError ?? modelError}</Text>
            </View>
          ) : null}
          <View className="min-h-32 rounded-[28px] border border-border bg-surface px-4 pb-3 pt-3">
            <TextInput
              value={draft}
              onChangeText={(value) => {
                draftEditedRef.current = true;
                draftRef.current = value;
                setDraft(value);
              }}
              multiline
              placeholder={busy ? "Queue a follow-up..." : "Ask for follow-up changes..."}
              placeholderTextColor={isDark ? "#737373" : "#9a9a9a"}
              className="max-h-28 min-h-16 text-[16px] leading-6 text-foreground"
              textAlignVertical="top"
            />
            <View className="mt-2 flex-row items-center">
              <Pressable
                accessibilityLabel="Select model"
                accessibilityRole="button"
                disabled={!effectiveModel}
                onPress={() => setModelSelectorOpen(true)}
                className="mr-2 flex-1 flex-row items-center gap-2 rounded-full py-2"
              >
                <View className="h-5 w-5 items-center justify-center rounded bg-default">
                  <Text className="text-[10px] font-bold text-muted">AI</Text>
                </View>
                <Text className="max-w-[70%] text-sm font-semibold text-muted" numberOfLines={1}>
                  {effectiveModel?.model ?? "T3 Code"}
                </Text>
                <AppIcon name="chevron-down" size={15} color={isDark ? "#858585" : "#737373"} />
                {busy ? <Text className="text-xs text-warning">Running</Text> : null}
              </Pressable>
              <Pressable
                accessibilityLabel="Thinking options"
                accessibilityRole="button"
                disabled={!effectiveModel}
                onPress={() => setThinkingSelectorOpen(true)}
                className="mr-2 max-w-[32%] rounded-full bg-default px-3 py-2"
              >
                <Text className="text-xs font-semibold text-muted" numberOfLines={1}>
                  {thinkingLabel}
                </Text>
              </Pressable>
              <Pressable
                disabled={!canSend}
                onPress={() => void submit()}
                className={`h-11 w-11 items-center justify-center rounded-full ${
                  canSend ? "bg-accent" : "bg-default"
                }`}
              >
                <AppIcon
                  name="arrow-up"
                  size={21}
                  color={canSend ? "#ffffff" : isDark ? "#737373" : "#a3a3a3"}
                  strokeWidth={2.4}
                />
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
      {effectiveModel ? (
        <ModelSelectorDrawer
          lockedProvider={hasExistingConversation}
          options={modelOptions}
          selected={effectiveModel}
          visible={modelSelectorOpen}
          onClose={() => setModelSelectorOpen(false)}
          onSelect={selectModel}
        />
      ) : null}
      {effectiveModel ? (
        <ThinkingOptionsDrawer
          descriptors={thinkingDescriptors}
          selection={effectiveModel}
          visible={thinkingSelectorOpen}
          onClose={() => setThinkingSelectorOpen(false)}
          onSelect={selectThinkingOption}
        />
      ) : null}
    </Screen>
  );
}
