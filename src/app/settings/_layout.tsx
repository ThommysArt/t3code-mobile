import { Stack } from "expo-router";
import { useColorScheme } from "react-native";

export default function SettingsLayout() {
  const colorScheme = useColorScheme();
  const backgroundColor = colorScheme === "dark" ? "#090909" : "#f4f4f5";

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor },
      }}
    />
  );
}