import type { OrchestrationMessage, OrchestrationThreadActivity } from "@t3tools/contracts";
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

import { AppIcon } from "@/components/AppIcon";
import { Screen } from "@/components/Screen";
import { useThread } from "@/runtime/useThread";
import { relativeTime } from "@/utils/time";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function InlineText({ value, isUser }: { readonly value: string; readonly isUser: boolean }) {
  const parts = value.split(/(`[^`\n]+`)/g);
  return (
    <Text
      selectable
      className={`text-[15px] leading-6 ${isUser ? "text-white" : "text-foreground"}`}
    >
      {parts.map((part, index) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <Text
            key={`${index}:${part}`}
            className={`font-mono ${isUser ? "bg-black/20 text-white" : "bg-default text-foreground"}`}
          >
            {part.slice(1, -1)}
          </Text>
        ) : (
          part
        )
      )}
    </Text>
  );
}

function MessageContent({ text, isUser }: { readonly text: string; readonly isUser: boolean }) {
  const blocks = useMemo(() => {
    const output: { readonly kind: "text" | "code"; readonly value: string }[] = [];
    const regex = /```(?:[\w.+-]+)?\n?([\s\S]*?)```/g;
    let cursor = 0;
    for (const match of text.matchAll(regex)) {
      const index = match.index ?? 0;
      if (index > cursor) output.push({ kind: "text", value: text.slice(cursor, index) });
      output.push({ kind: "code", value: match[1]?.trimEnd() ?? "" });
      cursor = index + match[0].length;
    }
    if (cursor < text.length) output.push({ kind: "text", value: text.slice(cursor) });
    return output.length > 0 ? output : [{ kind: "text" as const, value: text }];
  }, [text]);

  return (
    <View className="gap-2.5">
      {blocks.map((block, index) =>
        block.kind === "code" ? (
          <ScrollView
            key={`${index}:code`}
            horizontal
            className="rounded-xl bg-black/90"
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}
          >
            <Text selectable className="font-mono text-[13px] leading-5 text-neutral-200">
              {block.value}
            </Text>
          </ScrollView>
        ) : block.value.trim() ? (
          <InlineText key={`${index}:text`} value={block.value.trim()} isUser={isUser} />
        ) : null
      )}
    </View>
  );
}

function MessageRow({
  message,
}: {
  readonly message: OrchestrationMessage & { optimistic?: true };
}) {
  const isUser = message.role === "user";
  if (!message.text.trim()) return null;

  return (
    <View className={isUser ? "items-end" : "items-stretch"}>
      <View
        className={
          isUser
            ? "max-w-[88%] rounded-[24px] rounded-br-md bg-accent px-4 py-3"
            : "w-full px-1 py-1"
        }
      >
        <MessageContent text={message.text} isUser={isUser} />
      </View>
      <Text className="mt-1 px-1 text-[11px] text-muted">
        {message.optimistic ? "Queued" : relativeTime(message.createdAt)}
        {message.streaming ? " · live" : ""}
      </Text>
    </View>
  );
}

function ActivityRow({ activity }: { readonly activity: OrchestrationThreadActivity }) {
  return (
    <View className="flex-row gap-3 border-b border-separator px-3 py-3 last:border-b-0">
      <View className="mt-2 h-2 w-2 rounded-full bg-muted" />
      <View className="flex-1">
        <Text className="text-sm font-medium leading-5 text-foreground">{activity.summary}</Text>
        {"detail" in activity && typeof activity.detail === "string" && activity.detail.trim() ? (
          <Text className="mt-1 text-xs leading-5 text-muted" numberOfLines={3}>
            {activity.detail}
          </Text>
        ) : null}
        <Text className="mt-1 text-[11px] text-muted">{relativeTime(activity.createdAt)}</Text>
      </View>
    </View>
  );
}

export function ThreadScreen() {
  const params = useLocalSearchParams<{
    environmentId?: string | string[];
    threadId?: string | string[];
  }>();
  const router = useRouter();
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
    messages,
    refresh,
    sendError,
    sendMessage,
    shell,
    thread,
  } = useThread(environmentId, threadId);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const activities = useMemo(() => (thread?.activities ?? []).slice(-8), [thread?.activities]);
  const busy = thread?.session?.status === "running" || thread?.session?.status === "starting";
  const live = connectionState === "ready";
  const canSend = Boolean(thread && draft.trim());
  const statusLabel = live ? "Live" : dataSource === "http" ? "HTTP sync" : "Offline";
  const statusColor = live ? "#22c55e" : dataSource === "http" ? "#f59e0b" : "#737373";

  useEffect(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: false }));
  }, [messages.length, thread?.activities.length]);

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    clearSendError();
    await sendMessage(text);
  }, [clearSendError, draft, sendMessage]);

  return (
    <Screen>
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
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerStyle={{
            gap: 22,
            paddingHorizontal: 18,
            paddingBottom: 24,
            paddingTop: 18,
          }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
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

          {messages.map((message) => (
            <MessageRow key={message.id} message={message} />
          ))}

          {activities.length > 0 ? (
            <View className="gap-2">
              <Text className="px-1 text-xs font-bold uppercase tracking-[1px] text-muted">
                Work log
              </Text>
              <View className="overflow-hidden rounded-2xl border border-border bg-surface">
                {activities.map((activity) => (
                  <ActivityRow key={activity.id} activity={activity} />
                ))}
              </View>
            </View>
          ) : null}
        </ScrollView>

        <View className="border-t border-separator bg-background px-3 pb-2 pt-3">
          {sendError ? (
            <View className="mb-2 rounded-xl bg-danger-soft px-3 py-2">
              <Text className="text-xs leading-5 text-danger">{sendError}</Text>
            </View>
          ) : null}
          <View className="min-h-32 rounded-[28px] border border-border bg-surface px-4 pb-3 pt-3">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              multiline
              placeholder={busy ? "Queue a follow-up..." : "Ask for follow-up changes..."}
              placeholderTextColor={isDark ? "#737373" : "#9a9a9a"}
              className="max-h-28 min-h-16 text-[16px] leading-6 text-foreground"
              textAlignVertical="top"
            />
            <View className="mt-2 flex-row items-center">
              <View className="flex-1 flex-row items-center gap-2">
                <View className="h-5 w-5 items-center justify-center rounded bg-default">
                  <Text className="text-[10px] font-bold text-muted">AI</Text>
                </View>
                <Text className="text-sm font-semibold text-muted" numberOfLines={1}>
                  {thread?.modelSelection.model ?? "T3 Code"}
                </Text>
                {busy ? <Text className="text-xs text-warning">Running</Text> : null}
              </View>
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
    </Screen>
  );
}
