import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useChromeTheme } from "./useChromeTheme";

export function HeaderBubble(props: {
  readonly accessibilityLabel?: string;
  readonly children?: ReactNode;
  readonly disabled?: boolean;
  readonly onPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly subtitle?: string;
  readonly title?: string;
  readonly variant?: "icon" | "title" | "action";
}) {
  const theme = useChromeTheme();
  const variant = props.variant ?? "action";

  const shellStyle: ViewStyle =
    variant === "icon"
      ? {
          alignItems: "center",
          height: 40,
          justifyContent: "center",
          width: 40,
        }
      : variant === "title"
        ? {
            flexShrink: 1,
            height: 40,
            justifyContent: "center",
            maxWidth: "100%",
            minWidth: 0,
            paddingHorizontal: 12,
          }
        : {
            alignItems: "center",
            justifyContent: "center",
            minHeight: 40,
            minWidth: 40,
            paddingHorizontal: 12,
            paddingVertical: 8,
          };

  const content =
    props.title || props.subtitle ? (
      <View style={{ gap: 0, minWidth: 0 }}>
        {props.title ? (
          <Text
            numberOfLines={1}
            style={{
              color: theme.foreground,
              fontSize: 15,
              fontWeight: "600",
              lineHeight: 17,
            }}
          >
            {props.title}
          </Text>
        ) : null}
        {props.subtitle ? (
          <Text
            numberOfLines={1}
            style={{ color: theme.muted, fontSize: 10, lineHeight: 12 }}
          >
            {props.subtitle}
          </Text>
        ) : null}
      </View>
    ) : (
      props.children
    );

  // Titles sit on the progressive blur already — no card chrome.
  // Icon/action bubbles keep a light surface so they remain tappable targets.
  const chromeStyle: ViewStyle =
    variant === "title"
      ? {
          backgroundColor: "transparent",
          borderWidth: 0,
        }
      : {
          backgroundColor: theme.isDark ? "rgba(23,23,23,0.94)" : "rgba(255,255,255,0.94)",
          borderColor: theme.border,
          borderRadius: 20,
          borderWidth: StyleSheet.hairlineWidth,
        };

  const bubble = (
    <View style={StyleSheet.flatten([shellStyle, chromeStyle, props.style])}>{content}</View>
  );

  if (!props.onPress) return bubble;

  return (
    <Pressable
      accessibilityLabel={props.accessibilityLabel}
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.72 : props.disabled ? 0.45 : 1 })}
    >
      {bubble}
    </Pressable>
  );
}