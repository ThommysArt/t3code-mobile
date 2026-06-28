import { EnvironmentId, PROVIDER_DISPLAY_NAMES, ProviderInstanceId } from "@t3tools/contracts";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  useColorScheme,
  View,
} from "react-native";

import { ConnectionBanner } from "@/components/ConnectionBanner";
import { ProviderIcon } from "@/components/ProviderIcon";
import { BlurScreenRoot, HeaderBubble } from "@/components/chrome";
import { useChromeTheme } from "@/components/chrome/useChromeTheme";
import { Screen } from "@/components/Screen";
import { AppIcon } from "@/components/AppIcon";
import { useEnvironments } from "@/runtime/EnvironmentProvider";
import { usePrimaryEnvironment } from "@/runtime/usePrimaryEnvironment";
import { useServerSettings } from "@/runtime/useServerSettings";
import { formatRemoteError, logStatus } from "@/runtime/statusLog";
import { relativeTime } from "@/utils/time";

import { buildProviderEnabledPatch } from "./providerSettings";
import { getProviderSummary, getProviderVersionLabel } from "./providerStatus";
import {
  EnvironmentPicker,
  SettingsDivider,
  SettingsLoadingRow,
  SettingsScreenHeader,
  SettingsScroll,
  SettingsSection,
  SettingsSwitch,
} from "./SettingsComponents";

export function ProvidersScreen() {
  const isDark = useColorScheme() === "dark";
  const theme = useChromeTheme();
  const { getClient } = useEnvironments();
  const { primaryEnvironment, readyEnvironments, selectEnvironment } = usePrimaryEnvironment();
  const environmentId = primaryEnvironment?.connection.environmentId ?? null;
  const { settings, isLoading, error, isLive, refresh, updateSettings } =
    useServerSettings(environmentId);
  const [isRefreshingProviders, setIsRefreshingProviders] = useState(false);
  const refreshingRef = useRef(false);

  const providers = primaryEnvironment?.serverConfig?.providers ?? [];

  const lastCheckedAt = useMemo(() => {
    if (providers.length === 0) return null;
    return providers.reduce(
      (latest, provider) => (provider.checkedAt > latest ? provider.checkedAt : latest),
      providers[0]!.checkedAt
    );
  }, [providers]);

  const refreshProviders = useCallback(async () => {
    if (!environmentId || refreshingRef.current) return;
    const client = getClient(environmentId);
    if (!client) return;

    refreshingRef.current = true;
    setIsRefreshingProviders(true);
    try {
      await client.server.refreshProviders({});
      await refresh();
      logStatus("environment", "success", "Providers refreshed", undefined, {
        environmentId,
        toast: true,
      });
    } catch (refreshError) {
      Alert.alert(
        "Could not refresh providers",
        formatRemoteError(refreshError) || "The server could not refresh provider status."
      );
    } finally {
      refreshingRef.current = false;
      setIsRefreshingProviders(false);
    }
  }, [environmentId, getClient, refresh]);

  const toggleProvider = useCallback(
    async (instanceId: ProviderInstanceId, driver: string, enabled: boolean) => {
      if (!settings) return;
      try {
        await updateSettings(
          buildProviderEnabledPatch(settings, instanceId, driver, enabled)
        );
      } catch (updateError) {
        Alert.alert(
          "Could not update provider",
          formatRemoteError(updateError) || "The server rejected the provider update."
        );
      }
    },
    [settings, updateSettings]
  );

  const headerAction = (
    <>
      {lastCheckedAt ? (
        <HeaderBubble variant="action">
          <Text className="text-[11px] text-muted">Checked {relativeTime(lastCheckedAt)} ago</Text>
        </HeaderBubble>
      ) : null}
      <HeaderBubble
        accessibilityLabel="Refresh providers"
        disabled={!isLive || isRefreshingProviders}
        onPress={() => void refreshProviders()}
        variant="icon"
      >
        {isRefreshingProviders ? (
          <ActivityIndicator size="small" color="#f97316" />
        ) : (
          <AppIcon name="refresh" size={19} color={theme.foreground} />
        )}
      </HeaderBubble>
    </>
  );

  return (
    <Screen edges={["left", "right"]}>
      <BlurScreenRoot
        header={
          <SettingsScreenHeader
            title="Providers"
            subtitle="Manage installed providers on the connected server"
            action={headerAction}
          />
        }
      >
      <SettingsScroll>
        <EnvironmentPicker
          environments={readyEnvironments.map((environment) => ({
            environmentId: environment.connection.environmentId,
            label: environment.connection.label,
            connectionState: environment.connectionState,
          }))}
          selectedEnvironmentId={environmentId}
          onSelect={(nextEnvironmentId) =>
            selectEnvironment(EnvironmentId.make(nextEnvironmentId))
          }
        />

        {!isLive ? (
          <ConnectionBanner
            title="Live connection required"
            detail="Connect to a server over WebSocket to view provider status and toggle providers on or off."
          />
        ) : null}

        {error ? <ConnectionBanner title="Provider settings unavailable" detail={error} /> : null}

        <SettingsSection title="Providers">
          {isLoading && providers.length === 0 ? (
            <SettingsLoadingRow label="Loading providers..." />
          ) : providers.length === 0 ? (
            <View className="px-4 py-5">
              <Text className="text-sm leading-5 text-muted">
                No providers reported yet. Refresh after the server finishes its startup checks.
              </Text>
            </View>
          ) : (
            providers.map((provider, index) => {
              const summary = getProviderSummary(provider);
              const version = getProviderVersionLabel(provider.version);
              const displayName =
                provider.displayName ??
                PROVIDER_DISPLAY_NAMES[provider.driver] ??
                provider.driver;
              const detail = [summary.headline, summary.detail].filter(Boolean).join(" – ");
              const configuredEnabled =
                settings?.providerInstances?.[provider.instanceId]?.enabled ??
                settings?.providers[provider.driver as keyof NonNullable<typeof settings>["providers"]]
                  ?.enabled ??
                provider.enabled;

              return (
                <View key={provider.instanceId}>
                  {index > 0 ? <SettingsDivider /> : null}
                  <View className="gap-3 px-4 py-4">
                    <View className="flex-row items-start gap-3">
                      <ProviderIcon
                        driver={provider.driver}
                        label={displayName}
                        size={28}
                      />
                      <View className="flex-1 gap-1">
                        <View className="flex-row flex-wrap items-center gap-2">
                          <Text className="text-sm font-semibold text-foreground">
                            {displayName}
                          </Text>
                          {version ? (
                            <Text className="text-xs text-muted">{version}</Text>
                          ) : null}
                          {provider.badgeLabel ? (
                            <View className="rounded-full bg-warning-soft px-2 py-0.5">
                              <Text className="text-[10px] font-bold uppercase tracking-wide text-warning">
                                {provider.badgeLabel}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="text-sm leading-5 text-muted">{detail}</Text>
                      </View>
                      <SettingsSwitch
                        disabled={!isLive || !settings}
                        value={configuredEnabled}
                        onValueChange={(value) =>
                          void toggleProvider(provider.instanceId, provider.driver, value)
                        }
                      />
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </SettingsSection>
      </SettingsScroll>
      </BlurScreenRoot>
    </Screen>
  );
}