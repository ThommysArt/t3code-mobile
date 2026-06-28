import { useColorScheme } from "react-native";

export function useChromeTheme() {
  const isDark = useColorScheme() === "dark";

  return {
    isDark,
    background: isDark ? "#090909" : "#f4f4f5",
    surface: isDark ? "#171717" : "#ffffff",
    border: isDark ? "#303030" : "#dedede",
    foreground: isDark ? "#f5f5f5" : "#171717",
    muted: isDark ? "#858585" : "#737373",
  };
}