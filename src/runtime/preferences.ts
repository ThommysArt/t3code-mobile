import {
  DEFAULT_CLIENT_SETTINGS,
  DEFAULT_SIDEBAR_THREAD_PREVIEW_COUNT,
  DEFAULT_TIMESTAMP_FORMAT,
  ProviderInstanceId,
  type ModelSelection,
  type SidebarThreadPreviewCount,
  type TimestampFormat,
} from "@t3tools/contracts";

import { getSecureItem, setSecureItem } from "./secureStorage";
import { setLessToastsEnabled } from "./statusLog";

const PREFERENCES_KEY = "t3code.minimal.preferences";

export interface MobilePreferences {
  readonly timestampFormat: TimestampFormat;
  readonly confirmThreadArchive: boolean;
  readonly confirmThreadDelete: boolean;
  readonly sidebarThreadPreviewCount: SidebarThreadPreviewCount;
  /**
   * Prefer ambient connection status (live indicator) over routine toasts.
   * Major errors and source-control outcomes still toast. Default on.
   * Stored key was previously `minimalLogging`; both are accepted when loading.
   */
  readonly lessToasts: boolean;
  readonly defaultThreadModelSelection: ModelSelection | null;
  /**
   * Device-local mirror of the web beta's `sidebarV2Enabled`. Mobile has no
   * client-settings sync, so the flat v2 thread list is opted into per device.
   */
  readonly threadListV2Enabled: boolean;
  /**
   * Days of inactivity before auto-settle when Thread List v2 is on.
   * `null` disables inactivity auto-settle (explicit settle + PR still apply).
   */
  readonly autoSettleAfterDays: number | null;
}

export const DEFAULT_MOBILE_PREFERENCES: MobilePreferences = {
  timestampFormat: DEFAULT_TIMESTAMP_FORMAT,
  confirmThreadArchive: DEFAULT_CLIENT_SETTINGS.confirmThreadArchive,
  confirmThreadDelete: DEFAULT_CLIENT_SETTINGS.confirmThreadDelete,
  sidebarThreadPreviewCount: DEFAULT_SIDEBAR_THREAD_PREVIEW_COUNT,
  lessToasts: true,
  defaultThreadModelSelection: null,
  threadListV2Enabled: false,
  autoSettleAfterDays: DEFAULT_CLIENT_SETTINGS.sidebarAutoSettleAfterDays,
};

type PreferencesListener = () => void;

const listeners = new Set<PreferencesListener>();
let cachedPreferences: MobilePreferences = DEFAULT_MOBILE_PREFERENCES;
let loadPromise: Promise<MobilePreferences> | null = null;

function clampThreadPreviewCount(value: number): SidebarThreadPreviewCount {
  return Math.min(15, Math.max(1, Math.round(value))) as SidebarThreadPreviewCount;
}

function normalizePreferences(
  raw: (Partial<MobilePreferences> & { readonly minimalLogging?: boolean }) | null | undefined
): MobilePreferences {
  if (!raw) return DEFAULT_MOBILE_PREFERENCES;

  const timestampFormat =
    raw.timestampFormat === "12-hour" ||
    raw.timestampFormat === "24-hour" ||
    raw.timestampFormat === "locale"
      ? raw.timestampFormat
      : DEFAULT_MOBILE_PREFERENCES.timestampFormat;

  const autoSettleAfterDays =
    raw.autoSettleAfterDays === null
      ? null
      : typeof raw.autoSettleAfterDays === "number" &&
          Number.isInteger(raw.autoSettleAfterDays) &&
          raw.autoSettleAfterDays >= 1 &&
          raw.autoSettleAfterDays <= 90
        ? raw.autoSettleAfterDays
        : DEFAULT_MOBILE_PREFERENCES.autoSettleAfterDays;

  const lessToasts =
    typeof raw.lessToasts === "boolean"
      ? raw.lessToasts
      : typeof raw.minimalLogging === "boolean"
        ? raw.minimalLogging
        : DEFAULT_MOBILE_PREFERENCES.lessToasts;

  return {
    timestampFormat,
    confirmThreadArchive:
      raw.confirmThreadArchive ?? DEFAULT_MOBILE_PREFERENCES.confirmThreadArchive,
    confirmThreadDelete: raw.confirmThreadDelete ?? DEFAULT_MOBILE_PREFERENCES.confirmThreadDelete,
    sidebarThreadPreviewCount:
      typeof raw.sidebarThreadPreviewCount === "number"
        ? clampThreadPreviewCount(raw.sidebarThreadPreviewCount)
        : DEFAULT_MOBILE_PREFERENCES.sidebarThreadPreviewCount,
    lessToasts,
    defaultThreadModelSelection: normalizeModelSelection(raw.defaultThreadModelSelection),
    threadListV2Enabled: raw.threadListV2Enabled ?? DEFAULT_MOBILE_PREFERENCES.threadListV2Enabled,
    autoSettleAfterDays,
  };
}

function normalizeModelSelection(value: unknown): ModelSelection | null {
  if (!value || typeof value !== "object") return null;
  const selection = value as {
    readonly instanceId?: unknown;
    readonly model?: unknown;
    readonly options?: unknown;
  };
  if (typeof selection.instanceId !== "string" || typeof selection.model !== "string") {
    return null;
  }

  const options = Array.isArray(selection.options)
    ? selection.options
        .map((option) => {
          if (!option || typeof option !== "object") return null;
          const candidate = option as { readonly id?: unknown; readonly value?: unknown };
          if (typeof candidate.id !== "string") return null;
          if (typeof candidate.value !== "string" && typeof candidate.value !== "boolean") {
            return null;
          }
          return { id: candidate.id, value: candidate.value };
        })
        .filter((option): option is { readonly id: string; readonly value: string | boolean } =>
          Boolean(option)
        )
    : [];

  const instanceId = ProviderInstanceId.make(selection.instanceId);
  return options.length > 0
    ? { instanceId, model: selection.model, options }
    : { instanceId, model: selection.model };
}

function notifyListeners(): void {
  setLessToastsEnabled(cachedPreferences.lessToasts);
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
    const raw = await getSecureItem(PREFERENCES_KEY);
    if (!raw) {
      cachedPreferences = DEFAULT_MOBILE_PREFERENCES;
      setLessToastsEnabled(cachedPreferences.lessToasts);
      return cachedPreferences;
    }

    try {
      cachedPreferences = normalizePreferences(
        JSON.parse(raw) as Partial<MobilePreferences> & { readonly minimalLogging?: boolean }
      );
      setLessToastsEnabled(cachedPreferences.lessToasts);
      return cachedPreferences;
    } catch {
      cachedPreferences = DEFAULT_MOBILE_PREFERENCES;
      setLessToastsEnabled(cachedPreferences.lessToasts);
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
  await setSecureItem(PREFERENCES_KEY, JSON.stringify(next));
  notifyListeners();
  return next;
}
