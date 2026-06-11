import { Spinner, useToast, useThemeColor } from "heroui-native";
import { useEffect, useRef } from "react";
import { Text, View } from "react-native";

import {
  isStatusInProgress,
  subscribeStatus,
  type RuntimeStatusPhase,
  type StatusEvent,
  type StatusLevel,
} from "@/runtime/statusLog";

const PERSISTENT_STATUS_ID = "t3-runtime-status";
const ICON_BOX_SIZE = 20;

function toastVariant(level: StatusLevel): "default" | "accent" | "success" | "warning" | "danger" {
  switch (level) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "danger":
      return "danger";
    default:
      return "accent";
  }
}

function phaseLabel(phase: RuntimeStatusPhase | undefined, fallback: string): string {
  switch (phase) {
    case "starting":
      return "Starting";
    case "connecting":
      return "Connecting";
    case "syncing":
      return "Syncing";
    case "connected":
      return "Connected";
    case "reconnecting":
      return "Reconnecting";
    case "disconnected":
      return "Disconnected";
    case "error":
      return "Error";
    default:
      return fallback;
  }
}

function StatusToastIcon({ event }: { readonly event: StatusEvent }) {
  const successColor = useThemeColor("success");
  const warningColor = useThemeColor("warning");
  const dangerColor = useThemeColor("danger");
  const mutedColor = useThemeColor("muted");
  const accentColor = useThemeColor("accent");

  if (isStatusInProgress(event)) {
    return (
      <View
        className="items-center justify-center"
        style={{ width: ICON_BOX_SIZE, height: ICON_BOX_SIZE }}
      >
        <Spinner size="sm" color="accent">
          <Spinner.Indicator
            iconProps={{ width: ICON_BOX_SIZE, height: ICON_BOX_SIZE, color: accentColor }}
          />
        </Spinner>
      </View>
    );
  }

  if (event.phase === "connected" || event.level === "success") {
    return (
      <Text style={{ color: successColor, fontSize: 18, fontWeight: "700", lineHeight: 20 }}>
        ✓
      </Text>
    );
  }

  if (event.phase === "error" || event.level === "danger") {
    return (
      <Text style={{ color: dangerColor, fontSize: 18, fontWeight: "700", lineHeight: 20 }}>✕</Text>
    );
  }

  if (event.level === "warning" || event.phase === "disconnected") {
    return (
      <Text style={{ color: warningColor, fontSize: 18, fontWeight: "700", lineHeight: 20 }}>
        !
      </Text>
    );
  }

  return (
    <Text style={{ color: mutedColor, fontSize: 16, fontWeight: "700", lineHeight: 20 }}>i</Text>
  );
}

export function StatusToastBridge() {
  const { toast } = useToast();
  const lastPersistentKeyRef = useRef<string | null>(null);

  useEffect(() => {
    return subscribeStatus((event: StatusEvent) => {
      if (event.toast === false) {
        return;
      }

      const icon = <StatusToastIcon event={event} />;

      if (event.persistent) {
        const label = phaseLabel(event.phase, event.label);
        const key = `${event.environmentId ?? "app"}:${event.phase ?? "none"}:${isStatusInProgress(event) ? "progress" : "done"}:${label}:${event.description ?? ""}`;
        if (lastPersistentKeyRef.current === key) {
          return;
        }
        lastPersistentKeyRef.current = key;
        toast.show({
          id: PERSISTENT_STATUS_ID,
          duration: "persistent",
          variant: toastVariant(event.level),
          label,
          description: event.description,
          icon,
        });
        return;
      }

      toast.show({
        variant: toastVariant(event.level),
        label: event.label,
        description: event.description,
        duration: event.level === "danger" ? 8000 : 3500,
        icon,
      });
    });
  }, [toast]);

  return null;
}
