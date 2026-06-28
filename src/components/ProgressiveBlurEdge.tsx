import { BlurView, type BlurViewProps } from "expo-blur";
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

export function ProgressiveBlurEdge({
  backgroundColor,
  blurTarget,
  children,
  edge,
  height,
  isDark,
  style,
}: PropsWithChildren<{
  readonly backgroundColor: string;
  readonly blurTarget?: BlurViewProps["blurTarget"];
  readonly edge: Edge;
  readonly height: number;
  readonly isDark: boolean;
  readonly style?: ViewStyle;
}>) {
  const tint = isDark ? "systemMaterialDark" : "systemMaterialLight";
  const fadeColors =
    edge === "top"
      ? [alpha(backgroundColor, 0.72), alpha(backgroundColor, 0.22), alpha(backgroundColor, 0)]
      : [alpha(backgroundColor, 0), alpha(backgroundColor, 0.22), alpha(backgroundColor, 0.72)];

  return (
    <View
      style={[
        styles.edge,
        edge === "top" ? styles.top : styles.bottom,
        { height, pointerEvents: "box-none" },
        style,
      ]}
    >
      <View style={[StyleSheet.absoluteFill, styles.inert]}>
        <BlurView
          blurMethod="dimezisBlurViewSdk31Plus"
          blurReductionFactor={1.8}
          blurTarget={blurTarget}
          intensity={42}
          tint={tint}
          style={[StyleSheet.absoluteFill, styles.softBlur]}
        />
        <LinearGradient
          colors={fadeColors as [string, string, string]}
          locations={[0, 0.62, 1]}
          style={[StyleSheet.absoluteFill, styles.inert]}
        />
      </View>
      {children}
    </View>
  );
}

export function BlurredSurface({
  backgroundColor,
  blurTarget,
  borderColor,
  children,
  intensity = 100,
  isDark,
  radius,
  style,
}: PropsWithChildren<{
  readonly backgroundColor: string;
  readonly blurTarget?: BlurViewProps["blurTarget"];
  readonly borderColor?: string;
  readonly intensity?: number;
  readonly isDark: boolean;
  readonly radius: number;
  readonly style?: ViewStyle;
}>) {
  const tint = isDark ? "systemThinMaterialDark" : "systemThinMaterialLight";

  return (
    <View
      style={[
        styles.surface,
        {
          borderColor,
          borderRadius: radius,
          borderWidth: borderColor ? StyleSheet.hairlineWidth : 0,
        },
        style,
      ]}
    >
      <BlurView
        blurMethod="dimezisBlurViewSdk31Plus"
        blurReductionFactor={1}
        blurTarget={blurTarget}
        intensity={intensity}
        tint={tint}
        style={[StyleSheet.absoluteFill, styles.surfaceBlur]}
      />
      <BlurView
        blurMethod="dimezisBlurViewSdk31Plus"
        blurReductionFactor={1}
        blurTarget={blurTarget}
        intensity={intensity}
        tint={tint}
        style={[StyleSheet.absoluteFill, styles.surfaceBlurBoost]}
      />
      <BlurView
        blurMethod="dimezisBlurViewSdk31Plus"
        blurReductionFactor={1}
        blurTarget={blurTarget}
        intensity={intensity}
        tint={tint}
        style={[StyleSheet.absoluteFill, styles.surfaceBlurBoostExtra]}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: alpha(backgroundColor, isDark ? 0.34 : 0.46) },
        ]}
      />
      {children}
    </View>
  );
}

export function BlurredHeader({
  backgroundColor,
  blurTarget,
  children,
  isDark,
  style,
}: PropsWithChildren<{
  readonly backgroundColor: string;
  readonly blurTarget?: BlurViewProps["blurTarget"];
  readonly isDark: boolean;
  readonly style?: ViewStyle;
}>) {
  const tint = isDark ? "systemMaterialDark" : "systemMaterialLight";

  return (
    <View style={[styles.header, style]}>
      <BlurView
        blurMethod="dimezisBlurViewSdk31Plus"
        blurReductionFactor={1.8}
        blurTarget={blurTarget}
        intensity={76}
        tint={tint}
        style={[StyleSheet.absoluteFill, styles.headerBlur]}
      />
      <LinearGradient
        colors={[
          alpha(backgroundColor, isDark ? 0.7 : 0.82),
          alpha(backgroundColor, isDark ? 0.3 : 0.38),
          alpha(backgroundColor, 0),
        ]}
        locations={[0, 0.72, 1]}
        style={[StyleSheet.absoluteFill, styles.inert]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  edge: {
    left: 0,
    overflow: "hidden",
    position: "absolute",
    right: 0,
    zIndex: 20,
  },
  top: {
    top: 0,
  },
  bottom: {
    bottom: 0,
  },
  inert: {
    pointerEvents: "none",
  },
  softBlur: {
    opacity: 0.44,
    pointerEvents: "none",
  },
  surface: {
    overflow: "hidden",
  },
  surfaceBlur: {
    opacity: 1,
    pointerEvents: "none",
  },
  surfaceBlurBoost: {
    opacity: 0.85,
    pointerEvents: "none",
  },
  surfaceBlurBoostExtra: {
    opacity: 0.55,
    pointerEvents: "none",
  },
  header: {
    overflow: "hidden",
  },
  headerBlur: {
    opacity: 0.72,
    pointerEvents: "none",
  },
});
