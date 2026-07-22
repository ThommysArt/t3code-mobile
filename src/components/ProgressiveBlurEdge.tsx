import { LinearGradient } from "expo-linear-gradient";
import type { PropsWithChildren } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";

type Edge = "top" | "bottom";

function alpha(color: string, opacity: number): string {
  const hex = color.replace("#", "");
  const normalized =
    hex.length === 3
      ? hex
          .split("")
          .map((part) => `${part}${part}`)
          .join("")
      : hex;
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

/**
 * Progressive fade overlay — same approach as tanap event cards:
 * a LinearGradient band that softens scrolling content behind chrome.
 *
 * - `layout="overlay"` (default): absolute-positioned band for screen chrome.
 * - `layout="flow"`: in-flow height from children; gradient paints above/below
 *   without capturing touches. Prefer this under keyboard-sticky containers so
 *   the parent gets a real height and TextInput selection works.
 */
export function ProgressiveBlurEdge({
  backgroundColor,
  children,
  edge,
  fadeHeight,
  layout = "overlay",
  style,
}: PropsWithChildren<{
  readonly backgroundColor: string;
  readonly edge: Edge;
  readonly fadeHeight: number;
  readonly layout?: "overlay" | "flow";
  readonly style?: ViewStyle;
}>) {
  const fadeColors =
    edge === "top"
      ? ([
          alpha(backgroundColor, 0.96),
          alpha(backgroundColor, 0.68),
          alpha(backgroundColor, 0),
        ] as const)
      : ([
          alpha(backgroundColor, 0),
          alpha(backgroundColor, 0.68),
          alpha(backgroundColor, 0.96),
        ] as const);

  const isFlow = layout === "flow";

  return (
    <View
      pointerEvents="box-none"
      style={[
        isFlow ? styles.flowEdge : styles.edge,
        !isFlow && (edge === "top" ? styles.top : styles.bottom),
        !isFlow ? { minHeight: fadeHeight } : null,
        style,
      ]}
    >
      <LinearGradient
        colors={fadeColors}
        end={{ x: 0.5, y: 1 }}
        locations={[0, 0.42, 1]}
        pointerEvents="none"
        start={{ x: 0.5, y: 0 }}
        style={[
          styles.gradient,
          edge === "top" ? { height: fadeHeight, top: 0 } : { bottom: 0, height: fadeHeight },
        ]}
      />
      <View
        pointerEvents="box-none"
        style={[styles.content, edge === "top" ? styles.topContent : styles.bottomContent]}
      >
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  edge: {
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 20,
  },
  flowEdge: {
    overflow: "visible",
    width: "100%",
  },
  top: {
    top: 0,
  },
  bottom: {
    bottom: 0,
    justifyContent: "flex-end",
  },
  gradient: {
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 0,
  },
  content: {
    zIndex: 1,
  },
  topContent: {
    alignSelf: "flex-start",
    width: "100%",
  },
  bottomContent: {
    width: "100%",
  },
});
