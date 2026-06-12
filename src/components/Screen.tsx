import type { PropsWithChildren } from "react";
import { useColorScheme } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function Screen({ children }: PropsWithChildren) {
  const isDark = useColorScheme() === "dark";
  return (
    <SafeAreaView
      className="flex-1 bg-background"
      style={{ flex: 1, backgroundColor: isDark ? "#090909" : "#f4f4f5" }}
    >
      {children}
    </SafeAreaView>
  );
}
