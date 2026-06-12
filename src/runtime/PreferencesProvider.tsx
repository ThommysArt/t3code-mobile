import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from "react";

import {
  getPreferences,
  loadPreferences,
  savePreferences,
  subscribePreferences,
  type MobilePreferences,
} from "./preferences";

interface PreferencesContextValue {
  readonly preferences: MobilePreferences;
  readonly isLoading: boolean;
  readonly updatePreferences: (patch: Partial<MobilePreferences>) => Promise<void>;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: PropsWithChildren) {
  const preferences = useSyncExternalStore(subscribePreferences, getPreferences, getPreferences);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void loadPreferences().finally(() => setIsLoading(false));
  }, []);

  const updatePreferences = useCallback(async (patch: Partial<MobilePreferences>) => {
    await savePreferences(patch);
  }, []);

  const value = useMemo(
    () => ({
      preferences,
      isLoading,
      updatePreferences,
    }),
    [isLoading, preferences, updatePreferences]
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error("usePreferences must be used within PreferencesProvider");
  }
  return context;
}