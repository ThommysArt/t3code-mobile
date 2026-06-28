import { View } from "react-native";

/** Pushes trailing header bubbles to the right edge without stretching title bubbles. */
export function HeaderSpacer() {
  return <View style={{ flex: 1, minWidth: 0 }} />;
}