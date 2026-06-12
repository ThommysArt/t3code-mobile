import type { PropsWithChildren } from "react";
import { useColorScheme } from "react-native";
import { SafeAreaView, type SafeAreaViewProps } from "react-native-safe-area-context";

export function Screen({ children, edges }: PropsWithChildren<Pick<SafeAreaViewProps, "edges">>) {
  const isDark = useColorScheme() === "dark";
  return (
    <SafeAreaView
      edges={edges}
      className="flex-1 bg-background"
      style={{ flex: 1, backgroundColor: isDark ? "#090909" : "#f4f4f5" }}
    >
      {children}
    </SafeAreaView>
  );
}
