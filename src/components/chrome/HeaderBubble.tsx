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
            flexGrow: 1,
            flexShrink: 1,
            gap: 1,
            justifyContent: "center",
            minHeight: 40,
            minWidth: 0,
            paddingHorizontal: 14,
            paddingVertical: 6,
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
      <View style={{ gap: 1, minWidth: 0 }}>
        {props.title ? (
          <Text
            numberOfLines={1}
            style={{ color: theme.foreground, fontSize: 17, fontWeight: "700" }}
          >
            {props.title}
          </Text>
        ) : null}
        {props.subtitle ? (
          <Text numberOfLines={1} style={{ color: theme.muted, fontSize: 11 }}>
            {props.subtitle}
          </Text>
        ) : null}
      </View>
    ) : (
      props.children
    );

  const bubble = (
    <View
      style={StyleSheet.flatten([
        shellStyle,
        {
          backgroundColor: theme.isDark ? "rgba(23,23,23,0.94)" : "rgba(255,255,255,0.94)",
          borderColor: theme.border,
          borderRadius: variant === "icon" ? 20 : 22,
          borderWidth: StyleSheet.hairlineWidth,
        },
        props.style,
      ])}
    >
      {content}
    </View>
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