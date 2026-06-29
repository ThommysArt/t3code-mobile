import { memo, useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useChromeTheme } from "@/components/chrome/useChromeTheme";

type PendingModifier = "ctrl" | "meta" | null;

interface QuickKeyAction {
  readonly key: string;
  readonly label: string;
  readonly data: string;
  readonly kind?: "modifier";
  readonly modifier?: "ctrl" | "meta";
}

function applyCtrlModifier(input: string): string {
  const firstCharacter = input[0];
  if (!firstCharacter) {
    return input;
  }

  const lowerCharacter = firstCharacter.toLowerCase();
  if (lowerCharacter >= "a" && lowerCharacter <= "z") {
    return String.fromCharCode(lowerCharacter.charCodeAt(0) - 96);
  }

  if (firstCharacter === "@") return "\u0000";
  if (firstCharacter === "[") return "\u001b";
  if (firstCharacter === "\\") return "\u001c";
  if (firstCharacter === "]") return "\u001d";
  if (firstCharacter === "^") return "\u001e";
  if (firstCharacter === "_") return "\u001f";
  if (firstCharacter === "?") return "\u007f";

  return input;
}

function buildQuickKeyActions(hostPlatform: "mac" | "other"): readonly QuickKeyAction[] {
  const modifierActions: readonly QuickKeyAction[] =
    hostPlatform === "mac"
      ? [
          { key: "cmd", label: "cmd", data: "", kind: "modifier", modifier: "meta" },
          { key: "ctrl", label: "ctrl", data: "", kind: "modifier", modifier: "ctrl" },
        ]
      : [
          { key: "ctrl", label: "ctrl", data: "", kind: "modifier", modifier: "ctrl" },
          { key: "alt", label: "alt", data: "", kind: "modifier", modifier: "meta" },
        ];

  return [
    { key: "y", label: "Y", data: "y" },
    { key: "n", label: "N", data: "n" },
    { key: "esc", label: "esc", data: "\u001b" },
    ...modifierActions,
    { key: "tab", label: "tab", data: "\t" },
    { key: "enter", label: "⏎", data: "\n" },
    { key: "space", label: "space", data: " " },
    { key: "up", label: "↑", data: "\u001b[A" },
    { key: "down", label: "↓", data: "\u001b[B" },
    { key: "left", label: "←", data: "\u001b[D" },
    { key: "right", label: "→", data: "\u001b[C" },
  ];
}

export const TerminalQuickKeys = memo(function TerminalQuickKeys(props: {
  readonly disabled?: boolean;
  readonly hostPlatform?: "mac" | "other";
  readonly onSend: (data: string) => void;
}) {
  const theme = useChromeTheme();
  const [pendingModifier, setPendingModifier] = useState<PendingModifier>(null);
  const actions = buildQuickKeyActions(props.hostPlatform ?? "other");

  const sendWithModifier = useCallback(
    (data: string) => {
      if (props.disabled || data.length === 0) {
        return;
      }

      if (pendingModifier === "ctrl") {
        setPendingModifier(null);
        props.onSend(applyCtrlModifier(data));
        return;
      }

      if (pendingModifier === "meta") {
        setPendingModifier(null);
        props.onSend(`\u001b${data}`);
        return;
      }

      props.onSend(data);
    },
    [pendingModifier, props]
  );

  return (
    <View style={{ width: "100%", overflow: "hidden" }}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        style={{ width: "100%" }}
        contentContainerStyle={{
          alignItems: "center",
          paddingHorizontal: 2,
          paddingVertical: 4,
        }}
      >
        {actions.map((action, index) => {
          const active =
            action.kind === "modifier" && pendingModifier === action.modifier;

          return (
            <Pressable
              key={action.key}
              accessibilityRole="button"
              disabled={props.disabled}
              onPress={() => {
                if (action.kind === "modifier" && action.modifier) {
                  setPendingModifier((current) =>
                    current === action.modifier ? null : action.modifier ?? null
                  );
                  return;
                }

                sendWithModifier(action.data);
              }}
              className="rounded-full px-3 py-1.5"
              style={{
                backgroundColor: active ? "#f97316" : theme.surface,
                borderColor: theme.border,
                borderWidth: 1,
                marginRight: index < actions.length - 1 ? 6 : 0,
                opacity: props.disabled ? 0.5 : 1,
              }}
            >
              <Text
                className="text-[11px] font-semibold"
                style={{ color: active ? "#ffffff" : theme.foreground }}
              >
                {action.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
});