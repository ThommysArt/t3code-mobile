import { EnvironmentId, ProviderInstanceId } from "@t3tools/contracts";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import {
  buildProviderRows,
  getProviderRowStatusLabel,
  getProviderStatusKey,
  getProviderSummary,
  getProviderVersionLabel,
  isProviderRowBusy,
  PROVIDER_STATUS_COLORS,
  resolveConfiguredProviderEnabled,
  type ProviderRowModel,
} from "./providerStatus";
import {
  EnvironmentPicker,
  SettingsDivider,
  SettingsLoadingRow,
  SettingsScreenHeader,
  SettingsScroll,
  SettingsSection,
  SettingsSwitch,
} from "./SettingsComponents";

function ProvidersStatusStrip(props: {
  readonly isConnecting: boolean;
  readonly isLoadingSettings: boolean;
  readonly isRefreshingProviders: boolean;
  readonly lastCheckedAt: string | null;
  readonly providerCount: number;
}) {
  const isDark = useColorScheme() === "dark";
  const isBusy =
    props.isConnecting || props.isLoadingSettings || props.isRefreshingProviders;

  const { color, label } = useMemo(() => {
    if (props.isConnecting) {
      return {
        color: isDark ? "#93c5fd" : "#2563eb",
        label: "Connecting to server",
      };
    }
    if (props.isRefreshingProviders) {
      return {
        color: isDark ? "#60a5fa" : "#2563eb",
        label: "Refreshing provider status",
      };
    }
    if (props.isLoadingSettings) {
      return {
        color: isDark ? "#60a5fa" : "#2563eb",
        label: "Loading provider settings",
      };
    }
    if (props.providerCount > 0 && props.lastCheckedAt) {
      return {
        color: isDark ? "#4ade80" : "#16a34a",
        label: `Checked ${relativeTime(props.lastCheckedAt)} ago · ${props.providerCount} provider${
          props.providerCount === 1 ? "" : "s"
        }`,
      };
    }
    if (props.providerCount > 0) {
      return {
        color: isDark ? "#60a5fa" : "#2563eb",
        label: `${props.providerCount} provider${props.providerCount === 1 ? "" : "s"} reported`,
      };
    }
    return {
      color: isDark ? "#a3a3a3" : "#737373",
      label: "Waiting for provider status",
    };
  }, [
    isDark,
    props.isConnecting,
    props.isLoadingSettings,
    props.isRefreshingProviders,
    props.lastCheckedAt,
    props.providerCount,
  ]);

  return (
    <View className="flex-row items-center gap-1.5 px-1">
      <View className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      <Text className="text-[11px] font-semibold text-muted">{label}</Text>
      {isBusy ? <ActivityIndicator size="small" color={color} /> : null}
    </View>
  );
}

function ProviderRow(props: {
  readonly configuredEnabled: boolean;
  readonly displayName: string;
  readonly driver: string;
  readonly isLoadingSettings: boolean;
  readonly isLive: boolean;
  readonly isRefreshingProviders: boolean;
  readonly liveProvider?: ProviderRowModel["liveProvider"];
  readonly onToggle: (enabled: boolean) => void;
  readonly settingsReady: boolean;
}) {
  const isDark = useColorScheme() === "dark";
  const busy = isProviderRowBusy(props.liveProvider, {
    isLoadingSettings: props.isLoadingSettings,
    isRefreshingProviders: props.isRefreshingProviders,
  });
  const statusKey = busy
    ? "checking"
    : getProviderStatusKey(props.liveProvider, props.configuredEnabled);
  const statusColor = PROVIDER_STATUS_COLORS[statusKey][isDark ? "dark" : "light"];
  const summary = getProviderSummary(props.liveProvider);
  const statusLabel = getProviderRowStatusLabel(props.liveProvider, {
    isLoadingSettings: props.isLoadingSettings,
    isRefreshingProviders: props.isRefreshingProviders,
  });
  const version = getProviderVersionLabel(props.liveProvider?.version);
  const detail =
    summary.detail && summary.detail !== statusLabel ? summary.detail : null;

  return (
    <View className="gap-3 px-4 py-4" style={{ opacity: busy ? 0.82 : 1 }}>
      <View className="flex-row items-start gap-3">
        <View>
          <ProviderIcon driver={props.driver} label={props.displayName} size={28} />
          <View
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-surface"
            style={{ backgroundColor: statusColor }}
          />
        </View>
        <View className="min-w-0 flex-1 gap-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="text-sm font-semibold text-foreground">{props.displayName}</Text>
            {version ? <Text className="text-xs text-muted">{version}</Text> : null}
            {props.liveProvider?.badgeLabel ? (
              <View className="rounded-full bg-warning-soft px-2 py-0.5">
                <Text className="text-[10px] font-bold uppercase tracking-wide text-warning">
                  {props.liveProvider.badgeLabel}
                </Text>
              </View>
            ) : null}
          </View>
          <View className="flex-row items-center gap-1.5">
            {busy ? <ActivityIndicator size="small" color={statusColor} /> : null}
            <Text className="text-sm font-medium text-foreground">{statusLabel}</Text>
          </View>
          {detail ? (
            <Text className="text-xs leading-5 text-muted">{detail}</Text>
          ) : null}
          {props.liveProvider?.checkedAt && !busy ? (
            <Text className="text-[11px] text-muted">
              Checked {relativeTime(props.liveProvider.checkedAt)} ago
            </Text>
          ) : null}
        </View>
        <SettingsSwitch
          disabled={!props.isLive || !props.settingsReady || busy}
          value={props.configuredEnabled}
          onValueChange={(value) => props.onToggle(value)}
        />
      </View>
    </View>
  );
}

export function ProvidersScreen() {
  const theme = useChromeTheme();
  const { getClient } = useEnvironments();
  const { primaryEnvironment, readyEnvironments, selectEnvironment } = usePrimaryEnvironment();
  const environmentId = primaryEnvironment?.connection.environmentId ?? null;
  const { settings, isLoading, error, isLive, refresh, updateSettings } =
    useServerSettings(environmentId);
  const [isRefreshingProviders, setIsRefreshingProviders] = useState(false);
  const refreshingRef = useRef(false);

  const liveProviders = primaryEnvironment?.serverConfig?.providers ?? [];
  const providerRows = useMemo(
    () =>
      buildProviderRows({
        liveProviders,
        settingsProviderInstances: settings?.providerInstances,
      }),
    [liveProviders, settings?.providerInstances]
  );

  const lastCheckedAt = useMemo(() => {
    if (liveProviders.length === 0) return null;
    return liveProviders.reduce(
      (latest, provider) => (provider.checkedAt > latest ? provider.checkedAt : latest),
      liveProviders[0]!.checkedAt
    );
  }, [liveProviders]);

  const isConnecting =
    primaryEnvironment?.connectionState === "connecting" ||
    primaryEnvironment?.connectionState === "reconnecting";
  const isPageBusy = isConnecting || isLoading || isRefreshingProviders;
  const showInitialLoading = isPageBusy && providerRows.length === 0;

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
        await updateSettings(buildProviderEnabledPatch(settings, instanceId, driver, enabled));
      } catch (updateError) {
        Alert.alert(
          "Could not update provider",
          formatRemoteError(updateError) || "The server rejected the provider update."
        );
      }
    },
    [settings, updateSettings]
  );

  const headerStatus = isRefreshingProviders ? (
    <View className="flex-row items-center gap-1.5">
      <ActivityIndicator size="small" color="#2563eb" />
      <Text className="text-[11px] text-muted">Refreshing…</Text>
    </View>
  ) : isLoading ? (
    <View className="flex-row items-center gap-1.5">
      <ActivityIndicator size="small" color="#2563eb" />
      <Text className="text-[11px] text-muted">Loading…</Text>
    </View>
  ) : lastCheckedAt ? (
    <Text className="text-[11px] text-muted">Checked {relativeTime(lastCheckedAt)} ago</Text>
  ) : isLive ? (
    <Text className="text-[11px] text-muted">Waiting for status</Text>
  ) : null;

  const headerAction = (
    <>
      {headerStatus ? <HeaderBubble variant="action">{headerStatus}</HeaderBubble> : null}
      <HeaderBubble
        accessibilityLabel="Refresh providers"
        disabled={!isLive || isRefreshingProviders || isLoading}
        onPress={() => void refreshProviders()}
        variant="icon"
      >
        {isRefreshingProviders ? (
          <ActivityIndicator size="small" color="#2563eb" />
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

          {isLive ? (
            <ProvidersStatusStrip
              isConnecting={isConnecting}
              isLoadingSettings={isLoading}
              isRefreshingProviders={isRefreshingProviders}
              lastCheckedAt={lastCheckedAt}
              providerCount={providerRows.length}
            />
          ) : null}

          {!isLive ? (
            <ConnectionBanner
              title="Live connection required"
              detail="Connect to a server over WebSocket to view provider status and toggle providers on or off."
            />
          ) : null}

          {error ? <ConnectionBanner title="Provider settings unavailable" detail={error} /> : null}

          <SettingsSection title="Providers">
            {showInitialLoading ? (
              <SettingsLoadingRow
                label={
                  isRefreshingProviders
                    ? "Refreshing provider status..."
                    : isConnecting
                      ? "Connecting to server..."
                      : "Loading providers..."
                }
              />
            ) : providerRows.length === 0 ? (
              <View className="gap-3 px-4 py-5">
                <Text className="text-sm leading-5 text-muted">
                  No providers reported yet. Refresh after the server finishes its startup checks.
                </Text>
                {isLive ? (
                  <Text className="text-xs text-muted">
                    If this server should have providers configured, tap refresh in the header.
                  </Text>
                ) : null}
              </View>
            ) : (
              providerRows.map((row, index) => {
                const configuredEnabled = resolveConfiguredProviderEnabled(row, settings);

                return (
                  <View key={row.instanceId}>
                    {index > 0 ? <SettingsDivider /> : null}
                    <ProviderRow
                      configuredEnabled={configuredEnabled}
                      displayName={row.displayName}
                      driver={row.driver}
                      isLoadingSettings={isLoading}
                      isLive={isLive}
                      isRefreshingProviders={isRefreshingProviders}
                      liveProvider={row.liveProvider}
                      settingsReady={Boolean(settings)}
                      onToggle={(enabled) =>
                        void toggleProvider(row.instanceId, row.driver, enabled)
                      }
                    />
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