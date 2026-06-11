import { useSyncExternalStore } from "react";
import { Pressable, Text, View } from "react-native";

import {
  clearStatusHistory,
  getStatusHistory,
  subscribeStatusHistory,
  type StatusEvent,
} from "@/runtime/statusLog";
import { relativeTime } from "@/utils/time";

function toneClass(event: StatusEvent): string {
  if (event.level === "danger") return "bg-danger";
  if (event.level === "warning") return "bg-warning";
  if (event.level === "success") return "bg-success";
  return "bg-muted";
}

export function StatusLogPanel({ limit = 12 }: { readonly limit?: number }) {
  const events = useSyncExternalStore(subscribeStatusHistory, getStatusHistory, getStatusHistory);
  const visible = events.slice(-limit).reverse();

  return (
    <View className="overflow-hidden rounded-3xl border border-separator bg-surface">
      <View className="flex-row items-center justify-between border-b border-separator px-4 py-3">
        <View>
          <Text className="text-sm font-semibold text-foreground">Recent activity</Text>
          <Text className="mt-0.5 text-xs text-muted">
            Pairing, sync, and transport diagnostics
          </Text>
        </View>
        {events.length > 0 ? (
          <Pressable onPress={clearStatusHistory} hitSlop={10}>
            <Text className="text-xs font-semibold text-muted">Clear</Text>
          </Pressable>
        ) : null}
      </View>
      {visible.length === 0 ? (
        <Text className="px-4 py-5 text-sm text-muted">No runtime events recorded yet.</Text>
      ) : (
        visible.map((event, index) => (
          <View
            key={event.id}
            className={`flex-row gap-3 px-4 py-3 ${index > 0 ? "border-t border-separator" : ""}`}
          >
            <View className={`mt-1.5 h-2 w-2 rounded-full ${toneClass(event)}`} />
            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Text className="flex-1 text-sm font-medium text-foreground">{event.label}</Text>
                <Text className="text-[11px] text-muted">{relativeTime(event.timestamp)}</Text>
              </View>
              {event.description ? (
                <Text className="mt-1 text-xs leading-5 text-muted" selectable>
                  {event.description}
                </Text>
              ) : null}
            </View>
          </View>
        ))
      )}
    </View>
  );
}
