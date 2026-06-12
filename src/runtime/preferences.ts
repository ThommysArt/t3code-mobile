import {
  DEFAULT_CLIENT_SETTINGS,
  DEFAULT_SIDEBAR_THREAD_PREVIEW_COUNT,
  DEFAULT_TIMESTAMP_FORMAT,
  type SidebarThreadPreviewCount,
  type TimestampFormat,
} from "@t3tools/contracts";
import * as SecureStore from "expo-secure-store";

import { setMinimalLoggingEnabled } from "./statusLog";

const PREFERENCES_KEY = "t3code.minimal.preferences";

export interface MobilePreferences {
  readonly timestampFormat: TimestampFormat;
  readonly confirmThreadArchive: boolean;
  readonly confirmThreadDelete: boolean;
  readonly sidebarThreadPreviewCount: SidebarThreadPreviewCount;
  readonly minimalLogging: boolean;
}

export const DEFAULT_MOBILE_PREFERENCES: MobilePreferences = {
  timestampFormat: DEFAULT_TIMESTAMP_FORMAT,
  confirmThreadArchive: DEFAULT_CLIENT_SETTINGS.confirmThreadArchive,
  confirmThreadDelete: DEFAULT_CLIENT_SETTINGS.confirmThreadDelete,
  sidebarThreadPreviewCount: DEFAULT_SIDEBAR_THREAD_PREVIEW_COUNT,
  minimalLogging: false,
};

type PreferencesListener = () => void;

const listeners = new Set<PreferencesListener>();
let cachedPreferences: MobilePreferences = DEFAULT_MOBILE_PREFERENCES;
let loadPromise: Promise<MobilePreferences> | null = null;

function clampThreadPreviewCount(value: number): SidebarThreadPreviewCount {
  return Math.min(15, Math.max(1, Math.round(value))) as SidebarThreadPreviewCount;
}

function normalizePreferences(raw: Partial<MobilePreferences> | null | undefined): MobilePreferences {
  if (!raw) return DEFAULT_MOBILE_PREFERENCES;

  const timestampFormat =
    raw.timestampFormat === "12-hour" ||
    raw.timestampFormat === "24-hour" ||
    raw.timestampFormat === "locale"
      ? raw.timestampFormat
      : DEFAULT_MOBILE_PREFERENCES.timestampFormat;

  return {
    timestampFormat,
    confirmThreadArchive: raw.confirmThreadArchive ?? DEFAULT_MOBILE_PREFERENCES.confirmThreadArchive,
    confirmThreadDelete: raw.confirmThreadDelete ?? DEFAULT_MOBILE_PREFERENCES.confirmThreadDelete,
    sidebarThreadPreviewCount:
      typeof raw.sidebarThreadPreviewCount === "number"
        ? clampThreadPreviewCount(raw.sidebarThreadPreviewCount)
        : DEFAULT_MOBILE_PREFERENCES.sidebarThreadPreviewCount,
    minimalLogging: raw.minimalLogging ?? DEFAULT_MOBILE_PREFERENCES.minimalLogging,
  };
}

function notifyListeners(): void {
  setMinimalLoggingEnabled(cachedPreferences.minimalLogging);
  for (const listener of listeners) listener();
}

export function getPreferences(): MobilePreferences {
  return cachedPreferences;
}

export function subscribePreferences(listener: PreferencesListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function loadPreferences(): Promise<MobilePreferences> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const raw = await SecureStore.getItemAsync(PREFERENCES_KEY);
    if (!raw) {
      cachedPreferences = DEFAULT_MOBILE_PREFERENCES;
      setMinimalLoggingEnabled(cachedPreferences.minimalLogging);
      return cachedPreferences;
    }

    try {
      cachedPreferences = normalizePreferences(JSON.parse(raw) as Partial<MobilePreferences>);
      setMinimalLoggingEnabled(cachedPreferences.minimalLogging);
      return cachedPreferences;
    } catch {
      cachedPreferences = DEFAULT_MOBILE_PREFERENCES;
      setMinimalLoggingEnabled(cachedPreferences.minimalLogging);
      return cachedPreferences;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export async function savePreferences(
  patch: Partial<MobilePreferences>
): Promise<MobilePreferences> {
  const next = normalizePreferences({ ...cachedPreferences, ...patch });
  cachedPreferences = next;
  await SecureStore.setItemAsync(PREFERENCES_KEY, JSON.stringify(next));
  notifyListeners();
  return next;
}

