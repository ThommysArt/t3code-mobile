import { canSettle, effectiveSettled } from "@t3tools/client-runtime";
import type {
  ModelSelection,
  OrchestrationCheckpointSummary,
  OrchestrationMessage,
  TurnId,
} from "@t3tools/contracts";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { KeyboardChatScrollView } from "react-native-keyboard-controller";
import type Reanimated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/AppIcon";
import { BlurScreenRoot, HeaderBubble, HeaderSpacer } from "@/components/chrome";
import { useChromeTheme } from "@/components/chrome/useChromeTheme";
import { FloatingBottomChrome } from "@/components/FloatingBottomChrome";
import { ProviderIcon } from "@/components/ProviderIcon";
import { Screen } from "@/components/Screen";
import { useThreadListActions } from "@/features/home/useThreadListActions";
import { loadThreadDraft, saveThreadDraft } from "@/runtime/db";
import { usePreferences } from "@/runtime/PreferencesProvider";
import {
  useAttachmentImageUri,
  usePrefetchThreadAttachments,
} from "@/runtime/useAttachmentImage";
import { useThread } from "@/runtime/useThread";
import { estimatedComposerChromeHeight } from "@/utils/bottomChrome";
import { relativeTime } from "@/utils/time";
import { type SelectedImageAttachment } from "./messageAttachments";
import { pickImageAttachments } from "./imageAttachmentPicker";
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
import {
  buildThreadFeed,
  deriveThreadFeedPresentation,
  type ThreadFeedEntry,
} from "./threadActivity";
import {
  AssistantChangedFiles,
  ThreadWorkGroupToggle,
  ThreadWorkLog,
} from "./ThreadWorkLog";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function LocalMessageAttachment({
  name,
  uri,
}: {
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
            source={{ uri }}
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
              <ActivityIndicator color="#2563eb" />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function ServerMessageAttachment({
  attachmentId,
  environmentId,
  name,
}: {
  readonly attachmentId: string;
  readonly environmentId: string;
  readonly name: string;
}) {
  const { uri, cacheKey, isLoading: resolving } = useAttachmentImageUri(
    environmentId,
    attachmentId
  );
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setFailed(false);
    setLoading(true);
  }, [uri]);

  return (
    <View
      className="mb-2.5 w-full overflow-hidden rounded-2xl bg-surface-secondary"
      style={{ aspectRatio: 1.3 }}
    >
      {failed || (!resolving && !uri) ? (
        <View className="flex-1 items-center justify-center gap-2 px-4">
          <Text className="text-center text-xs text-muted">Unable to load {name}</Text>
        </View>
      ) : uri ? (
        <>
          <Image
            accessibilityLabel={name}
            source={{
              uri,
              ...(cacheKey ? { cacheKey } : {}),
            }}
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
          {loading || resolving ? (
            <View className="absolute inset-0 items-center justify-center">
              <ActivityIndicator color="#2563eb" />
            </View>
          ) : null}
        </>
      ) : (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#2563eb" />
        </View>
      )}
    </View>
  );
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

function MessageRow({
  environmentId,
  message,
}: {
  readonly environmentId: string;
  readonly message: OrchestrationMessage & {
    readonly optimistic?: true;
    readonly localImageAttachments?: readonly { readonly name: string; readonly uri: string }[];
  };
}) {
  const isUser = message.role === "user";
  const isDark = useColorScheme() === "dark";
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const attachments = message.attachments ?? [];
  const localImageAttachments =
    "localImageAttachments" in message ? (message.localImageAttachments ?? []) : [];
  const collapsible = isUser && shouldCollapsePrompt(message.text);
  if (!message.text.trim() && attachments.length === 0 && localImageAttachments.length === 0) {
    return null;
  }
  const copyMessage = () => {
    const text = message.text.trim();
    if (!text) return;
    void Clipboard.setStringAsync(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <View className={isUser ? "items-end" : "items-stretch"}>
      <View
        className={
          isUser ? "w-[80%] rounded-[24px] rounded-br-md bg-default px-4 py-3" : "w-full px-1 py-1"
        }
      >
        {localImageAttachments.map((attachment) => (
          <LocalMessageAttachment
            key={attachment.uri}
            name={attachment.name}
            uri={attachment.uri}
          />
        ))}
        {attachments.map((attachment) => (
          <ServerMessageAttachment
            key={attachment.id}
            attachmentId={attachment.id}
            environmentId={environmentId}
            name={attachment.name}
          />
        ))}
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
      <View className="mt-1 flex-row items-center gap-2 px-1">
        <Text className="text-[11px] text-muted">
          {message.optimistic ? "Queued" : relativeTime(message.createdAt)}
          {message.streaming ? " · live" : ""}
        </Text>
        {message.text.trim() ? (
          <Pressable
            accessibilityLabel={copied ? "Message copied" : "Copy message"}
            accessibilityRole="button"
            hitSlop={8}
            onPress={copyMessage}
            className="flex-row items-center gap-1 rounded-full px-1.5 py-0.5"
          >
            <AppIcon name="copy" size={12} color={isDark ? "#858585" : "#737373"} />
            <Text className="text-[11px] font-semibold text-muted">
              {copied ? "Copied" : "Copy"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function AssistantMessageRow({
  checkpoint,
  environmentId,
  message,
  showMeta,
}: {
  readonly checkpoint: OrchestrationCheckpointSummary | null;
  readonly environmentId: string;
  readonly message: OrchestrationMessage;
  readonly showMeta: boolean;
}) {
  const isDark = useColorScheme() === "dark";
  const [copied, setCopied] = useState(false);
  const attachments = message.attachments ?? [];
  const text = message.text.trim();

  if (text.length === 0 && attachments.length === 0) {
    return null;
  }

  const copyMessage = () => {
    if (!text) return;
    void Clipboard.setStringAsync(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <View className={showMeta ? "mb-5 px-1" : "mb-2 px-1"}>
      {text ? <MarkdownContent text={message.text} /> : null}
      {attachments.map((attachment) => (
        <ServerMessageAttachment
          key={attachment.id}
          attachmentId={attachment.id}
          environmentId={environmentId}
          name={attachment.name}
        />
      ))}
      {checkpoint ? <AssistantChangedFiles checkpoint={checkpoint} /> : null}
      {showMeta ? (
        <View className="mt-1 flex-row items-center gap-2">
          <Pressable
            accessibilityLabel={copied ? "Response copied" : "Copy response"}
            accessibilityRole="button"
            hitSlop={8}
            onPress={copyMessage}
            className="flex-row items-center gap-1 rounded-full px-1.5 py-0.5"
          >
            <AppIcon name="copy" size={12} color={isDark ? "#858585" : "#737373"} />
            <Text className="text-[11px] font-semibold text-muted">
              {copied ? "Copied" : "Copy"}
            </Text>
          </Pressable>
          <Text className="text-[11px] text-muted">
            {relativeTime(message.updatedAt)}
            {message.streaming ? " · live" : ""}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function FeedEntryRow({
  checkpointByAssistantMessageId,
  copiedWorkRowId,
  entry,
  environmentId,
  expandedWorkRows,
  terminalAssistantMessageIds,
  unsettledTurnId,
  onCopyWorkRow,
  onToggleTurnFold,
  onToggleWorkGroup,
  onToggleWorkRow,
}: {
  readonly checkpointByAssistantMessageId: ReadonlyMap<
    OrchestrationMessage["id"],
    OrchestrationCheckpointSummary
  >;
  readonly copiedWorkRowId: string | null;
  readonly entry: ThreadFeedEntry;
  readonly environmentId: string;
  readonly expandedWorkRows: Readonly<Record<string, boolean>>;
  readonly terminalAssistantMessageIds: ReadonlySet<string>;
  readonly unsettledTurnId: TurnId | null;
  readonly onCopyWorkRow: (rowId: string, value: string) => void;
  readonly onToggleTurnFold: (turnId: TurnId) => void;
  readonly onToggleWorkGroup: (groupId: string) => void;
  readonly onToggleWorkRow: (rowId: string) => void;
}) {
  const isDark = useColorScheme() === "dark";

  if (entry.type === "turn-fold") {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: entry.expanded }}
        onPress={() => onToggleTurnFold(entry.turnId)}
        hitSlop={4}
        className="mb-3 min-h-11 flex-row items-center gap-2 border-b border-separator px-2"
      >
        <Text className="flex-1 text-sm font-medium tabular-nums text-muted">{entry.label}</Text>
        <AppIcon
          name={entry.expanded ? "chevron-down" : "chevron-right"}
          size={15}
          color={isDark ? "#858585" : "#737373"}
        />
      </Pressable>
    );
  }

  if (entry.type === "work-toggle") {
    return (
      <ThreadWorkGroupToggle
        expanded={entry.expanded}
        hiddenCount={entry.hiddenCount}
        onlyToolActivities={entry.onlyToolActivities}
        onToggle={() => onToggleWorkGroup(entry.groupId)}
      />
    );
  }

  if (entry.type === "message") {
    const { message } = entry;
    if (message.role === "user") {
      return <MessageRow environmentId={environmentId} message={message} />;
    }

    const assistantTurnStillInProgress =
      message.turnId !== null &&
      unsettledTurnId !== null &&
      message.turnId === unsettledTurnId;
    const showMeta =
      terminalAssistantMessageIds.has(message.id) &&
      !assistantTurnStillInProgress &&
      !message.streaming;

    return (
      <AssistantMessageRow
        checkpoint={checkpointByAssistantMessageId.get(message.id) ?? null}
        environmentId={environmentId}
        message={message}
        showMeta={showMeta}
      />
    );
  }

  return (
    <ThreadWorkLog
      activities={entry.activities}
      copiedRowId={copiedWorkRowId}
      expandedRows={expandedWorkRows}
      onCopyRow={onCopyWorkRow}
      onToggleRow={onToggleWorkRow}
    />
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
    isCached,
    isPending,
    interruptTurn,
    messages,
    refresh,
    sendError,
    sendMessage,
    serverConfig,
    shell,
    thread,
    updateModelSelection,
  } = useThread(environmentId, threadId);
  usePrefetchThreadAttachments(environmentId, messages);
  const { preferences } = usePreferences();
  const { settleThread, unsettleThread, environmentSupportsSettlement } = useThreadListActions();
  const [draft, setDraft] = useState("");
  const [selectedAttachments, setSelectedAttachments] = useState<
    readonly SelectedImageAttachment[]
  >([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const draftRef = useRef("");
  const draftEditedRef = useRef(false);
  const draftHydratedRef = useRef(false);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [thinkingSelectorOpen, setThinkingSelectorOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelSelection | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [expandedTurnIds, setExpandedTurnIds] = useState<ReadonlySet<TurnId>>(new Set());
  const [expandedWorkGroups, setExpandedWorkGroups] = useState<Readonly<Record<string, boolean>>>(
    {}
  );
  const [expandedWorkRows, setExpandedWorkRows] = useState<Readonly<Record<string, boolean>>>({});
  const [copiedWorkRowId, setCopiedWorkRowId] = useState<string | null>(null);
  const [bottomChromeHeight, setBottomChromeHeight] = useState(() =>
    estimatedComposerChromeHeight(insets)
  );
  const [headerHeight, setHeaderHeight] = useState(insets.top + 52);
  const theme = useChromeTheme();
  const scrollRef = useRef<Reanimated.ScrollView>(null);
  const stickToBottomRef = useRef(true);
  const baseFeed = useMemo(() => {
    if (!thread) return [];
    return buildThreadFeed(thread, { loadedMessages: messages });
  }, [messages, thread]);
  const expandedWorkGroupIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [groupId, expanded] of Object.entries(expandedWorkGroups)) {
      if (expanded) ids.add(groupId);
    }
    return ids;
  }, [expandedWorkGroups]);
  const feed = useMemo(
    () =>
      deriveThreadFeedPresentation(
        baseFeed,
        thread?.latestTurn ?? null,
        expandedTurnIds,
        expandedWorkGroupIds
      ),
    [baseFeed, expandedTurnIds, expandedWorkGroupIds, thread?.latestTurn]
  );
  const terminalAssistantMessageIds = useMemo(() => {
    const terminalIdsByTurn = new Map<TurnId, string>();
    for (const entry of baseFeed) {
      if (entry.type === "message" && entry.message.role === "assistant" && entry.message.turnId) {
        terminalIdsByTurn.set(entry.message.turnId, entry.message.id);
      }
    }
    return new Set(terminalIdsByTurn.values());
  }, [baseFeed]);
  const unsettledTurnId =
    thread?.latestTurn &&
    (thread.latestTurn.completedAt === null || thread.latestTurn.state === "running")
      ? thread.latestTurn.turnId
      : null;
  const checkpointByAssistantMessageId = useMemo(() => {
    const checkpoints = (thread?.checkpoints ?? []).filter(
      (checkpoint) => checkpoint.status === "ready" && checkpoint.files.length > 0
    );
    const map = new Map<OrchestrationMessage["id"], OrchestrationCheckpointSummary>();
    for (const checkpoint of checkpoints) {
      if (checkpoint.assistantMessageId) {
        map.set(checkpoint.assistantMessageId, checkpoint);
      }
    }
    return map;
  }, [thread?.checkpoints]);
  const busy = thread?.session?.status === "running" || thread?.session?.status === "starting";
  const live = connectionState === "ready";
  const canSend = Boolean(thread && (draft.trim() || selectedAttachments.length > 0));
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

  const updateStickToBottom = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
    stickToBottomRef.current = distanceFromBottom < 80;
  }, []);

  const scrollToBottomIfPinned = useCallback(() => {
    if (!stickToBottomRef.current) return;
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
  }, []);

  useEffect(() => {
    if (thread?.modelSelection) setSelectedModel(thread.modelSelection);
  }, [thread?.modelSelection]);

  useEffect(() => {
    let active = true;
    draftHydratedRef.current = false;
    draftEditedRef.current = false;
    draftRef.current = "";
    setDraft("");
    setSelectedAttachments([]);
    setAttachmentError(null);

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
    const text = draft.trim();
    if ((!text && selectedAttachments.length === 0) || !effectiveModel) return;
    const attachments = selectedAttachments;
    draftRef.current = "";
    setDraft("");
    setSelectedAttachments([]);
    setAttachmentError(null);
    void saveThreadDraft(environmentId, threadId, "");
    clearSendError();
    await sendMessage(
      text,
      effectiveModel,
      attachments.map((attachment) => attachment.upload),
      attachments.map((attachment) => ({ name: attachment.name, uri: attachment.previewUri }))
    );
  }, [
    clearSendError,
    draft,
    effectiveModel,
    environmentId,
    selectedAttachments,
    sendMessage,
    threadId,
  ]);

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

  const toggleTurnFold = useCallback((turnId: TurnId) => {
    setExpandedTurnIds((current) => {
      const next = new Set(current);
      if (next.has(turnId)) next.delete(turnId);
      else next.add(turnId);
      return next;
    });
  }, []);

  const toggleWorkGroup = useCallback((groupId: string) => {
    setExpandedWorkGroups((current) => ({
      ...current,
      [groupId]: !(current[groupId] ?? false),
    }));
  }, []);

  const toggleWorkRow = useCallback((rowId: string) => {
    setExpandedWorkRows((current) => ({
      ...current,
      [rowId]: !(current[rowId] ?? false),
    }));
  }, []);

  const copyWorkRow = useCallback((rowId: string, value: string) => {
    void Clipboard.setStringAsync(value);
    setCopiedWorkRowId(rowId);
    setTimeout(() => {
      setCopiedWorkRowId((current) => (current === rowId ? null : current));
    }, 1200);
  }, []);

  const threadTitle = thread?.title ?? shell?.title ?? "Thread";
  const threadSubtitle = `${statusLabel} · ${thread?.branch ?? shell?.branch ?? "main"}`;
  const settlementSupported =
    shell != null && environmentSupportsSettlement(shell.environmentId);
  const nowIso = new Date().toISOString();
  const threadIsSettled =
    shell != null &&
    settlementSupported &&
    effectiveSettled(shell, {
      now: nowIso,
      autoSettleAfterDays: preferences.autoSettleAfterDays,
    });
  const canSettleThread =
    shell != null && settlementSupported && !threadIsSettled && canSettle(shell, { now: nowIso });
  const showSettleAction =
    preferences.threadListV2Enabled &&
    shell != null &&
    settlementSupported &&
    (threadIsSettled || canSettleThread);

  return (
    <Screen edges={["left", "right"]}>
      <BlurScreenRoot
        onHeaderHeightChange={setHeaderHeight}
        header={
          <>
            <HeaderBubble accessibilityLabel="Go back" onPress={() => router.back()} variant="icon">
              <AppIcon name="back" size={21} color={theme.foreground} />
            </HeaderBubble>
            <HeaderBubble subtitle={threadSubtitle} title={threadTitle} variant="title" />
            <HeaderSpacer />
            {showSettleAction ? (
              <HeaderBubble
                accessibilityLabel={threadIsSettled ? "Un-settle thread" : "Settle thread"}
                onPress={() => {
                  if (!shell) return;
                  if (threadIsSettled) void unsettleThread(shell);
                  else void settleThread(shell);
                }}
                variant="icon"
              >
                <AppIcon
                  name={threadIsSettled ? "refresh" : "check"}
                  size={20}
                  color={theme.foreground}
                />
              </HeaderBubble>
            ) : null}
            <HeaderBubble
              accessibilityLabel="Open source control"
              onPress={() =>
                router.push({
                  pathname: "/threads/[environmentId]/[threadId]/git",
                  params: { environmentId, threadId },
                })
              }
              variant="icon"
            >
              <AppIcon name="git" size={20} color={theme.foreground} />
            </HeaderBubble>
            <HeaderBubble
              accessibilityLabel="Open workspace tools"
              onPress={() =>
                router.push({
                  pathname: "/threads/[environmentId]/[threadId]/workspace",
                  params: { environmentId, threadId },
                })
              }
              variant="icon"
            >
              <AppIcon name="panels" size={20} color={theme.foreground} />
            </HeaderBubble>
          </>
        }
        footer={
          <FloatingBottomChrome onHeightChange={setBottomChromeHeight}>
            {sendError || modelError || attachmentError ? (
              <View className="mb-2 rounded-xl bg-danger-soft px-3 py-2">
                <Text className="text-xs leading-5 text-danger">
                  {sendError ?? modelError ?? attachmentError}
                </Text>
              </View>
            ) : null}
            <View className="min-h-28 rounded-[20px] border border-border bg-surface px-3 pb-2.5 pt-2.5">
              {selectedAttachments.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  className="mb-3"
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
              <TextInput
                value={draft}
                onChangeText={(value) => {
                  draftEditedRef.current = true;
                  draftRef.current = value;
                  setDraft(value);
                }}
                multiline
                scrollEnabled
                placeholder={busy ? "Queue a follow-up..." : "Ask for follow-up changes..."}
                placeholderTextColor={isDark ? "#737373" : "#9a9a9a"}
                selectionColor={isDark ? "#60a5fa" : "#2563eb"}
                className="max-h-24 min-h-14 w-full text-[14px] leading-5 text-foreground"
                style={{ width: "100%" }}
                textAlignVertical="top"
              />
              <View className="mt-2 flex-row items-center">
                <Pressable
                  accessibilityLabel="Attach images"
                  accessibilityRole="button"
                  onPress={() => void addImages()}
                  className="mr-2 h-8 w-8 items-center justify-center rounded-full bg-default"
                >
                  <AppIcon name="image" size={18} color={isDark ? "#d4d4d4" : "#525252"} />
                </Pressable>
                <Pressable
                  accessibilityLabel="Select model"
                  accessibilityRole="button"
                  disabled={!effectiveModel}
                  onPress={() => setModelSelectorOpen(true)}
                  className="mr-2 flex-1 flex-row items-center gap-2 rounded-full py-2"
                >
                  <ProviderIcon
                    driver={selectedModelOption?.providerDriver ?? effectiveModel?.instanceId ?? ""}
                    label={selectedModelOption?.providerLabel ?? effectiveModel?.model ?? "AI"}
                    size={20}
                  />
                  <Text className="max-w-[70%] text-sm font-semibold text-muted" numberOfLines={1}>
                    {effectiveModel?.model ?? "T3 Code"}
                  </Text>
                  <AppIcon name="chevron-down" size={15} color={isDark ? "#858585" : "#737373"} />
                </Pressable>
                {thinkingDescriptors.length > 0 ? (
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
                ) : null}
                <Pressable
                  accessibilityLabel={busy ? "Stop running agent" : "Send message"}
                  accessibilityRole="button"
                  disabled={!busy && !canSend}
                  onPress={() => void (busy ? interruptTurn() : submit())}
                  className={`h-8 w-8 items-center justify-center rounded-full ${
                    busy ? "bg-danger" : canSend ? "bg-accent" : "bg-default"
                  }`}
                >
                  <AppIcon
                    name={busy ? "stop" : "arrow-up"}
                    size={busy ? 17 : 18}
                    color={busy || canSend ? "#ffffff" : isDark ? "#737373" : "#a3a3a3"}
                    strokeWidth={2.3}
                  />
                </Pressable>
              </View>
            </View>
          </FloatingBottomChrome>
        }
      >
        <KeyboardChatScrollView
          ref={scrollRef}
          className="flex-1"
          style={{ flex: 1 }}
          offset={bottomChromeHeight}
          keyboardLiftBehavior="always"
          contentContainerStyle={{
            gap: 16,
            paddingHorizontal: 12,
            paddingBottom: bottomChromeHeight + 12,
            paddingTop: headerHeight + 4,
          }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          scrollEventThrottle={32}
          onScroll={updateStickToBottom}
          onContentSizeChange={scrollToBottomIfPinned}
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
              <ActivityIndicator color="#2563eb" />
              <Text className="text-sm text-muted">Loading thread history</Text>
            </View>
          ) : null}

          {feed.map((entry) => (
            <FeedEntryRow
              key={entry.id}
              checkpointByAssistantMessageId={checkpointByAssistantMessageId}
              copiedWorkRowId={copiedWorkRowId}
              entry={entry}
              environmentId={environmentId}
              expandedWorkRows={expandedWorkRows}
              terminalAssistantMessageIds={terminalAssistantMessageIds}
              unsettledTurnId={unsettledTurnId}
              onCopyWorkRow={copyWorkRow}
              onToggleTurnFold={toggleTurnFold}
              onToggleWorkGroup={toggleWorkGroup}
              onToggleWorkRow={toggleWorkRow}
            />
          ))}
        </KeyboardChatScrollView>
      </BlurScreenRoot>
      <ModelSelectorDrawer
        lockedProvider={hasExistingConversation}
        options={modelOptions}
        selected={effectiveModel}
        visible={modelSelectorOpen && effectiveModel != null}
        onClose={() => setModelSelectorOpen(false)}
        onSelect={selectModel}
      />
      <ThinkingOptionsDrawer
        descriptors={thinkingDescriptors}
        selection={effectiveModel}
        visible={thinkingSelectorOpen && effectiveModel != null && thinkingDescriptors.length > 0}
        onClose={() => setThinkingSelectorOpen(false)}
        onSelect={selectThinkingOption}
      />
    </Screen>
  );
}
