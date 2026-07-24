import {
  DMSans_100Thin,
  DMSans_200ExtraLight,
  DMSans_300Light,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  DMSans_800ExtraBold,
  DMSans_900Black,
} from "@expo-google-fonts/dm-sans";
import {
  GeistMono_400Regular,
  GeistMono_500Medium,
  GeistMono_600SemiBold,
  GeistMono_700Bold,
} from "@expo-google-fonts/geist-mono";
import React from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  type StyleProp,
  type TextStyle,
} from "react-native";

/** Font faces loaded at app start (covers weights used across the UI). */
export const appFontMap = {
  DMSans_100Thin,
  DMSans_200ExtraLight,
  DMSans_300Light,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
  DMSans_800ExtraBold,
  DMSans_900Black,
  GeistMono_400Regular,
  GeistMono_500Medium,
  GeistMono_600SemiBold,
  GeistMono_700Bold,
} as const;

export const dmSansFaces = {
  thin: "DMSans_100Thin",
  extraLight: "DMSans_200ExtraLight",
  light: "DMSans_300Light",
  regular: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  semiBold: "DMSans_600SemiBold",
  bold: "DMSans_700Bold",
  extraBold: "DMSans_800ExtraBold",
  black: "DMSans_900Black",
} as const;

export const geistMonoFaces = {
  regular: "GeistMono_400Regular",
  medium: "GeistMono_500Medium",
  semiBold: "GeistMono_600SemiBold",
  bold: "GeistMono_700Bold",
} as const;

/** Default mono face for explicit `fontFamily: "monospace"` usage. */
export const GEIST_MONO = geistMonoFaces.regular;

const WEIGHT_CLASS_RE =
  /\bfont-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/;

const MONO_FAMILY_RE = /mono|menlo|courier|geistmono|sfmono|consolas/i;

function isMonoFamily(fontFamily: string | undefined): boolean {
  return Boolean(fontFamily && MONO_FAMILY_RE.test(fontFamily));
}

function isLoadedAppFace(fontFamily: string | undefined): boolean {
  if (!fontFamily) return false;
  return fontFamily.startsWith("DMSans_") || fontFamily.startsWith("GeistMono_");
}

export function dmSansFaceForWeight(weight: TextStyle["fontWeight"] | undefined): string {
  if (weight === "bold") return dmSansFaces.bold;
  if (weight === "normal" || weight == null) return dmSansFaces.regular;

  const numeric = typeof weight === "number" ? weight : Number.parseInt(String(weight), 10);
  if (Number.isNaN(numeric) || numeric <= 400) return dmSansFaces.regular;
  if (numeric <= 500) return dmSansFaces.medium;
  if (numeric <= 600) return dmSansFaces.semiBold;
  if (numeric <= 700) return dmSansFaces.bold;
  if (numeric <= 800) return dmSansFaces.extraBold;
  return dmSansFaces.black;
}

export function geistMonoFaceForWeight(weight: TextStyle["fontWeight"] | undefined): string {
  if (weight === "bold") return geistMonoFaces.bold;
  if (weight === "normal" || weight == null) return geistMonoFaces.regular;

  const numeric = typeof weight === "number" ? weight : Number.parseInt(String(weight), 10);
  if (Number.isNaN(numeric) || numeric <= 400) return geistMonoFaces.regular;
  if (numeric <= 500) return geistMonoFaces.medium;
  if (numeric <= 600) return geistMonoFaces.semiBold;
  return geistMonoFaces.bold;
}

type TextLikeProps = {
  className?: string;
  style?: StyleProp<TextStyle>;
  [key: string]: unknown;
};

function weightFromClassName(className: string | undefined): TextStyle["fontWeight"] | undefined {
  if (!className) return undefined;
  if (/\bfont-thin\b/.test(className)) return "100";
  if (/\bfont-extralight\b/.test(className)) return "200";
  if (/\bfont-light\b/.test(className)) return "300";
  if (/\bfont-normal\b/.test(className)) return "400";
  if (/\bfont-medium\b/.test(className)) return "500";
  if (/\bfont-semibold\b/.test(className)) return "600";
  if (/\bfont-bold\b/.test(className)) return "700";
  if (/\bfont-extrabold\b/.test(className)) return "800";
  if (/\bfont-black\b/.test(className)) return "900";
  return undefined;
}

function withAppFontProps(props: TextLikeProps | null | undefined): TextLikeProps {
  const safeProps = props ?? {};
  const flat = (StyleSheet.flatten(safeProps.style) ?? {}) as TextStyle;
  const classNameRaw = safeProps.className ?? "";
  const wantsMono =
    isMonoFamily(flat.fontFamily) ||
    flat.fontFamily?.startsWith("GeistMono_") ||
    /\bfont-mono\b/.test(classNameRaw);

  // Mono: always pin Geist Mono (weight class utilities otherwise reassign DM Sans).
  if (wantsMono) {
    const weight = flat.fontWeight ?? weightFromClassName(classNameRaw);
    const fontFamily = geistMonoFaceForWeight(weight);
    return {
      ...safeProps,
      style: [safeProps.style, { fontFamily }],
    };
  }

  if (isLoadedAppFace(flat.fontFamily)) {
    return safeProps;
  }

  const hasWeightClass = WEIGHT_CLASS_RE.test(classNameRaw);
  const className = hasWeightClass
    ? safeProps.className
    : safeProps.className
      ? `font-normal ${safeProps.className}`
      : "font-normal";

  // Inline fontWeight (outside Tailwind classes) must pick the matching face on Android.
  if (flat.fontWeight != null && flat.fontWeight !== "normal" && flat.fontWeight !== "400") {
    const fontFamily = dmSansFaceForWeight(flat.fontWeight);
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
 * Apply DM Sans as the default UI font (and Geist Mono for mono faces)
 * for React Native Text / TextInput. Safe to call once at app startup.
 */
export function enableAppTextPolyfill(): void {
  if (polyfillEnabled) return;
  polyfillEnabled = true;

  const originalCreateElement = React.createElement;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (React as any).createElement = (type: any, props: any, ...children: any[]) => {
    if (isTextLikeType(type)) {
      return originalCreateElement(type, withAppFontProps(props), ...children);
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
        return original(type, withAppFontProps(props as TextLikeProps), ...rest);
      }
      return original(type, props, ...rest);
    };
  }
}
