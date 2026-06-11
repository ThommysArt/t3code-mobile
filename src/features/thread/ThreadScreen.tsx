import type { OrchestrationMessage, OrchestrationThreadActivity } from "@t3tools/contracts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button, Card, Chip } from "heroui-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";

import { ConnectionBanner } from "@/components/ConnectionBanner";
import { Screen } from "@/components/Screen";
import { useThread } from "@/runtime/useThread";
import { relativeTime } from "@/utils/time";

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function MessageBubble({
  message,
}: {
  readonly message: OrchestrationMessage & { optimistic?: true };
}) {
  const isUser = message.role === "user";
  if (!message.text.trim()) return null;

  return (
    <View className={isUser ? "items-end" : "items-start"}>
      <View
        className={
          isUser
            ? "max-w-[86%] rounded-3xl rounded-br-md bg-accent px-4 py-3"
            : "max-w-[94%] rounded-3xl rounded-bl-md bg-default-100 px-4 py-3"
        }
      >
        <Text
          selectable
          className={
            isUser ? "text-[15px] leading-6 text-white" : "text-[15px] leading-6 text-foreground"
          }
        >
          {message.text}
        </Text>
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
    <View className="flex-row gap-2 rounded-2xl bg-default-50 px-3 py-2.5">
      <View className="mt-1.5 h-2 w-2 rounded-full bg-default-400" />
      <View className="flex-1">
        <Text className="text-sm font-medium text-foreground">{activity.summary}</Text>
        <Text className="mt-0.5 text-[11px] text-muted">{relativeTime(activity.createdAt)}</Text>
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
  const environmentId = firstParam(params.environmentId);
  const threadId = firstParam(params.threadId);
  const {
    cachedReceivedAt,
    clearSendError,
    error,
    isCached,
    isPending,
    messages,
    sendError,
    sendMessage,
    shell,
    thread,
  } = useThread(environmentId, threadId);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<ScrollView>(null);
  const recentActivities = useMemo(
    () => (thread?.activities ?? []).slice(-6),
    [thread?.activities]
  );
  const busy = thread?.session?.status === "running" || thread?.session?.status === "starting";

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
      <View className="flex-row items-center gap-3 border-b border-divider px-4 pb-3 pt-1">
        <Button size="sm" variant="ghost" onPress={() => router.back()}>
          Back
        </Button>
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground" numberOfLines={1}>
            {thread?.title ?? shell?.title ?? "Thread"}
          </Text>
          <Text className="text-xs text-muted" numberOfLines={1}>
            {thread?.branch ?? shell?.branch ?? "No branch"}
          </Text>
        </View>
        {busy ? (
          <Chip size="sm" color="warning" variant="soft">
            Running
          </Chip>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          onPress={() =>
            router.push({
              pathname: "/threads/[environmentId]/[threadId]/git",
              params: { environmentId, threadId },
            })
          }
        >
          Git
        </Button>
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1"
          contentContainerClassName="gap-5 px-4 py-5"
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {error ? <ConnectionBanner title="Thread unavailable" detail={error} /> : null}
          {isCached && cachedReceivedAt ? (
            <ConnectionBanner
              title="Showing cached history"
              detail={`Last synced ${relativeTime(cachedReceivedAt)}. Reconnect to refresh live messages.`}
            />
          ) : null}
          {isPending && !thread ? (
            <Card>
              <Card.Body>
                <Card.Description>Loading thread history...</Card.Description>
              </Card.Body>
            </Card>
          ) : null}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          {recentActivities.length > 0 ? (
            <View className="gap-2">
              <Text className="text-xs font-bold uppercase tracking-[1.3px] text-muted">
                Recent activity
              </Text>
              {recentActivities.map((activity) => (
                <ActivityRow key={activity.id} activity={activity} />
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View className="gap-2 border-t border-divider bg-background px-4 pb-3 pt-3">
          {sendError ? <Text className="text-xs text-danger">{sendError}</Text> : null}
          <View className="flex-row items-end gap-2">
            <TextInput
              value={draft}
              onChangeText={setDraft}
              multiline
              placeholder={busy ? "Queue a follow-up..." : "Ask for follow-up changes..."}
              placeholderTextColor="#8b8b95"
              className="max-h-36 min-h-12 flex-1 rounded-2xl border border-divider bg-default-50 px-4 py-3 text-[15px] text-foreground"
              textAlignVertical="top"
            />
            <Button
              isIconOnly
              size="lg"
              isDisabled={!draft.trim() || !thread}
              onPress={() => void submit()}
            >
              <Button.Label>{busy ? "+" : "↑"}</Button.Label>
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
