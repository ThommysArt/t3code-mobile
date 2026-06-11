import { Stack } from "expo-router";
import { HeroUINativeProvider } from "heroui-native";
import { useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import "../global.css";
import { StatusToastBridge } from "@/components/StatusToastBridge";
import { EnvironmentProvider } from "@/runtime/EnvironmentProvider";

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const backgroundColor = colorScheme === "dark" ? "#090909" : "#f4f4f5";

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor }}>
      <SafeAreaProvider>
        <HeroUINativeProvider
          config={{
            toast: {
              defaultProps: {
                placement: "bottom",
                isSwipeable: true,
              },
            },
          }}
        >
          <EnvironmentProvider>
            <StatusToastBridge />
            <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor } }} />
          </EnvironmentProvider>
        </HeroUINativeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
