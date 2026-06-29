import Stack from "expo-router/stack";

export default function ThreadLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="git"
        options={{
          animation: "slide_from_right",
        }}
      />
      <Stack.Screen
        name="workspace"
        options={{
          animation: "slide_from_right",
        }}
      />
    </Stack>
  );
}