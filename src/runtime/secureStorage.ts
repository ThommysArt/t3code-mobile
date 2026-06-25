import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

function hasNativeSecureStore(): boolean {
  return (
    Platform.OS !== "web" &&
    typeof SecureStore.getItemAsync === "function" &&
    typeof SecureStore.setItemAsync === "function"
  );
}

function webStorage(): Storage | null {
  try {
    return typeof globalThis.localStorage === "undefined" ? null : globalThis.localStorage;
  } catch {
    return null;
  }
}

export async function getSecureItem(key: string): Promise<string | null> {
  if (hasNativeSecureStore()) {
    return SecureStore.getItemAsync(key);
  }
  return webStorage()?.getItem(key) ?? null;
}

export async function setSecureItem(key: string, value: string): Promise<void> {
  if (hasNativeSecureStore()) {
    await SecureStore.setItemAsync(key, value);
    return;
  }
  webStorage()?.setItem(key, value);
}
