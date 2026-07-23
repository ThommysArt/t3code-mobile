import { RegistryContext } from "@effect/atom-react";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { HeroUINativeProvider } from "heroui-native";
import { useEffect } from "react";
import { useColorScheme, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

import "../global.css";
import { StatusToastBridge } from "@/components/StatusToastBridge";
import { AgentNotifications } from "@/runtime/AgentNotifications";
import { appAtomRegistry } from "@/runtime/atom-registry";
import { EnvironmentProvider } from "@/runtime/EnvironmentProvider";
import { PreferencesProvider } from "@/runtime/PreferencesProvider";
import { appFontMap, enableAppTextPolyfill } from "@/theme/fonts";

SplashScreen.preventAutoHideAsync().catch(() => {
  // Splash may already be hidden in some environments.
});

enableAppTextPolyfill();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const backgroundColor = colorScheme === "dark" ? "#090909" : "#f4f4f5";
  const [fontsLoaded, fontError] = useFonts(appFontMap);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <HeroUINativeProvider
            config={{
              toast: {
                defaultProps: {
                  placement: "top",
                  isSwipeable: true,
                },
                insets: {
                  left: 12,
                  right: 12,
                },
              },
            }}
          >
            <PreferencesProvider>
              <RegistryContext.Provider value={appAtomRegistry}>
                <EnvironmentProvider>
                  <View style={{ flex: 1, position: "relative" }}>
                    <AgentNotifications />
                    <StatusToastBridge />
                    <StatusBar style={colorScheme === "dark" ? "light" : "dark"} />
                    <Stack
                      screenOptions={{ headerShown: false, contentStyle: { backgroundColor } }}
                    />
                  </View>
                </EnvironmentProvider>
              </RegistryContext.Provider>
            </PreferencesProvider>
          </HeroUINativeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
