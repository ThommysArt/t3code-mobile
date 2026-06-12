import { Image, type ImageSource } from "expo-image";
import { Text, useColorScheme, View } from "react-native";

const ICONS = {
  anthropic: {
    light: require("../../assets/provider-icons/anthropic-light.svg") as ImageSource,
    dark: require("../../assets/provider-icons/anthropic-dark.svg") as ImageSource,
  },
  codex: {
    light: require("../../assets/provider-icons/codex-light.svg") as ImageSource,
    dark: require("../../assets/provider-icons/codex-dark.svg") as ImageSource,
  },
  cursor: {
    light: require("../../assets/provider-icons/cursor-light.svg") as ImageSource,
    dark: require("../../assets/provider-icons/cursor-dark.svg") as ImageSource,
  },
  gemini: {
    light: require("../../assets/provider-icons/gemini.svg") as ImageSource,
    dark: require("../../assets/provider-icons/gemini.svg") as ImageSource,
  },
  openai: {
    light: require("../../assets/provider-icons/openai-light.svg") as ImageSource,
    dark: require("../../assets/provider-icons/openai-dark.svg") as ImageSource,
  },
  opencode: {
    light: require("../../assets/provider-icons/opencode-light.svg") as ImageSource,
    dark: require("../../assets/provider-icons/opencode-dark.svg") as ImageSource,
  },
} as const;

type IconKey = keyof typeof ICONS;

function providerIconKey(driver: string, label: string): IconKey | null {
  const value = `${driver} ${label}`.toLowerCase();
  if (value.includes("claude") || value.includes("anthropic")) return "anthropic";
  if (value.includes("opencode")) return "opencode";
  if (value.includes("cursor")) return "cursor";
  if (value.includes("gemini") || value.includes("google")) return "gemini";
  if (value.includes("codex")) return "codex";
  if (value.includes("openai") || value.includes("chatgpt")) return "openai";
  return null;
}

export function ProviderIcon({
  driver,
  label,
  size = 20,
}: {
  readonly driver: string;
  readonly label: string;
  readonly size?: number;
}) {
  const isDark = useColorScheme() === "dark";
  const iconKey = providerIconKey(driver, label);

  if (!iconKey) {
    return (
      <View
        className="items-center justify-center rounded-md bg-default"
        style={{ height: size, width: size }}
      >
        <Text className="text-[9px] font-bold uppercase text-muted">{label.slice(0, 1)}</Text>
      </View>
    );
  }

  return (
    <Image
      accessibilityLabel={`${label} logo`}
      source={ICONS[iconKey][isDark ? "dark" : "light"]}
      contentFit="contain"
      style={{ height: size, width: size }}
    />
  );
}
