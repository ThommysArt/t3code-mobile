import {
  Geist_100Thin,
  Geist_200ExtraLight,
  Geist_300Light,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  Geist_800ExtraBold,
  Geist_900Black,
} from "@expo-google-fonts/geist";
import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  type StyleProp,
  type TextStyle,
} from "react-native";

/** Font faces loaded at app start (covers weights used across the UI). */
export const geistFontMap = {
  Geist_100Thin,
  Geist_200ExtraLight,
  Geist_300Light,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
  Geist_800ExtraBold,
  Geist_900Black,
} as const;

export const geistFaces = {
  thin: "Geist_100Thin",
  extraLight: "Geist_200ExtraLight",
  light: "Geist_300Light",
  regular: "Geist_400Regular",
  medium: "Geist_500Medium",
  semiBold: "Geist_600SemiBold",
  bold: "Geist_700Bold",
  extraBold: "Geist_800ExtraBold",
  black: "Geist_900Black",
} as const;

const WEIGHT_CLASS_RE =
  /\bfont-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/;

const MONO_FAMILY_RE = /mono|menlo|courier|geistmono/i;

function isMonoFamily(fontFamily: string | undefined): boolean {
  return Boolean(fontFamily && MONO_FAMILY_RE.test(fontFamily));
}

export function geistFaceForWeight(weight: TextStyle["fontWeight"] | undefined): string {
  if (weight === "bold") return geistFaces.bold;
  if (weight === "normal" || weight == null) return geistFaces.regular;

  const numeric = typeof weight === "number" ? weight : Number.parseInt(String(weight), 10);
  if (Number.isNaN(numeric) || numeric <= 400) return geistFaces.regular;
  if (numeric <= 500) return geistFaces.medium;
  if (numeric <= 600) return geistFaces.semiBold;
  if (numeric <= 700) return geistFaces.bold;
  if (numeric <= 800) return geistFaces.extraBold;
  return geistFaces.black;
}

type TextLikeProps = {
  className?: string;
  style?: StyleProp<TextStyle>;
  [key: string]: unknown;
};

function withGeistProps(props: TextLikeProps | null | undefined): TextLikeProps {
  const safeProps = props ?? {};
  const flat = (StyleSheet.flatten(safeProps.style) ?? {}) as TextStyle;

  if (isMonoFamily(flat.fontFamily) || flat.fontFamily?.startsWith("Geist_")) {
    return safeProps;
  }

  const hasWeightClass = WEIGHT_CLASS_RE.test(safeProps.className ?? "");
  const className = hasWeightClass
    ? safeProps.className
    : safeProps.className
      ? `font-normal ${safeProps.className}`
      : "font-normal";

  // Inline fontWeight (outside Tailwind classes) must pick the matching face on Android.
  if (flat.fontWeight != null && flat.fontWeight !== "normal" && flat.fontWeight !== "400") {
    const fontFamily = geistFaceForWeight(flat.fontWeight);
    return {
      ...safeProps,
      className,
      style: [safeProps.style, { fontFamily }],
    };
  }

  return {
    ...safeProps,
    className,
  };
}

function isTextLikeType(type: unknown): boolean {
  return type === Text || type === TextInput;
}

let polyfillEnabled = false;

/**
 * Apply Geist as the default UI font for React Native Text / TextInput.
 * Safe to call once at app startup (before first render).
 */
export function enableGeistTextPolyfill(): void {
  if (polyfillEnabled) return;
  polyfillEnabled = true;

  const originalCreateElement = React.createElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (React as any).createElement = (type: any, props: any, ...children: any[]) => {
    if (isTextLikeType(type)) {
      return originalCreateElement(type, withGeistProps(props), ...children);
    }
    return originalCreateElement(type, props, ...children);
  };

  // Automatic JSX runtime does not go through React.createElement.
  patchJsxRuntime(require("react/jsx-runtime"));
  try {
    patchJsxRuntime(require("react/jsx-dev-runtime"));
  } catch {
    // Production builds may omit the dev runtime.
  }
}

function patchJsxRuntime(jsxRuntime: {
  jsx?: (...args: unknown[]) => unknown;
  jsxs?: (...args: unknown[]) => unknown;
  jsxDEV?: (...args: unknown[]) => unknown;
}): void {
  for (const key of ["jsx", "jsxs", "jsxDEV"] as const) {
    const original = jsxRuntime[key];
    if (typeof original !== "function") continue;
    jsxRuntime[key] = (type: unknown, props: unknown, ...rest: unknown[]) => {
      if (isTextLikeType(type)) {
        return original(type, withGeistProps(props as TextLikeProps), ...rest);
      }
      return original(type, props, ...rest);
    };
  }
}
