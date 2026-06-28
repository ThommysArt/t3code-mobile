import {
  PROVIDER_DISPLAY_NAMES,
  type ProviderInstanceConfig,
  type ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";

export type ProviderStatusKey = "checking" | "disabled" | "error" | "ready" | "warning";

export const PROVIDER_STATUS_COLORS: Record<
  ProviderStatusKey,
  { readonly dark: string; readonly light: string }
> = {
  checking: { dark: "#60a5fa", light: "#2563eb" },
  disabled: { dark: "#fbbf24", light: "#d97706" },
  error: { dark: "#f87171", light: "#dc2626" },
  ready: { dark: "#4ade80", light: "#16a34a" },
  warning: { dark: "#fbbf24", light: "#f59e0b" },
};

export interface ProviderRowModel {
  readonly configuredEnabled: boolean;
  readonly displayName: string;
  readonly driver: string;
  readonly instanceId: ProviderInstanceId;
  readonly liveProvider?: ServerProvider;
}

export function isProviderUpdateActive(provider: Pick<ServerProvider, "updateState">): boolean {
  const status = provider.updateState?.status;
  return status === "queued" || status === "running";
}

export function getProviderStatusKey(
  provider: ServerProvider | undefined,
  configuredEnabled: boolean
): ProviderStatusKey {
  if (!provider) return "checking";
  if (!configuredEnabled || !provider.enabled) return "disabled";
  if (provider.status === "error") return "error";
  if (provider.status === "warning") return "warning";
  if (provider.status === "ready") return "ready";
  return "warning";
}

export function isProviderRowBusy(
  provider: ServerProvider | undefined,
  options: {
    readonly isLoadingSettings: boolean;
    readonly isRefreshingProviders: boolean;
  }
): boolean {
  if (options.isLoadingSettings && !provider) return true;
  if (options.isRefreshingProviders) return true;
  if (provider && isProviderUpdateActive(provider)) return true;
  return false;
}

export function getProviderRowStatusLabel(
  provider: ServerProvider | undefined,
  options: {
    readonly isLoadingSettings: boolean;
    readonly isRefreshingProviders: boolean;
  }
): string {
  if (provider && isProviderUpdateActive(provider)) {
    const updateStatus = provider.updateState?.status;
    if (updateStatus === "queued") return "Update queued";
    return provider.updateState?.message ?? "Updating provider";
  }
  if (options.isRefreshingProviders) return "Refreshing status";
  if (options.isLoadingSettings && !provider) return "Checking provider status";
  return getProviderSummary(provider).headline;
}

export function getProviderSummary(provider: ServerProvider | undefined) {
  if (!provider) {
    return {
      headline: "Checking provider status",
      detail: "Waiting for the server to report installation and authentication details.",
    };
  }
  if (!provider.enabled) {
    return {
      headline: "Disabled",
      detail:
        provider.message ?? "This provider is installed but disabled for new sessions in T3 Code.",
    };
  }
  if (!provider.installed) {
    return {
      headline: "Not found",
      detail: provider.message ?? "CLI not detected on PATH.",
    };
  }
  if (provider.auth.status === "authenticated") {
    const authLabel = provider.auth.label ?? provider.auth.type;
    return {
      headline: authLabel ? `Authenticated · ${authLabel}` : "Authenticated",
      detail: provider.message ?? null,
    };
  }
  if (provider.auth.status === "unauthenticated") {
    return {
      headline: "Not authenticated",
      detail: provider.message ?? null,
    };
  }
  if (provider.status === "warning") {
    return {
      headline: "Needs attention",
      detail:
        provider.message ?? "The provider is installed, but the server could not fully verify it.",
    };
  }
  if (provider.status === "error") {
    return {
      headline: "Unavailable",
      detail: provider.message ?? "The provider failed its startup checks.",
    };
  }
  return {
    headline: "Available",
    detail: provider.message ?? "Installed and ready, but authentication could not be verified.",
  };
}

export function getProviderVersionLabel(version: string | null | undefined): string | null {
  if (!version) return null;
  return version.startsWith("v") ? version : `v${version}`;
}

export function buildProviderRows(input: {
  readonly liveProviders: readonly ServerProvider[];
  readonly settingsProviderInstances?: Readonly<Record<string, ProviderInstanceConfig>>;
}): readonly ProviderRowModel[] {
  if (input.liveProviders.length > 0) {
    return input.liveProviders.map((provider) => ({
      configuredEnabled: provider.enabled,
      displayName:
        provider.displayName ??
        PROVIDER_DISPLAY_NAMES[provider.driver as keyof typeof PROVIDER_DISPLAY_NAMES] ??
        provider.driver,
      driver: provider.driver,
      instanceId: provider.instanceId,
      liveProvider: provider,
    }));
  }

  const instances = input.settingsProviderInstances ?? {};
  return Object.entries(instances).map(([instanceId, instance]) => ({
    configuredEnabled: instance.enabled ?? true,
    displayName:
      instance.displayName?.trim() ||
      PROVIDER_DISPLAY_NAMES[instance.driver as keyof typeof PROVIDER_DISPLAY_NAMES] ||
      instance.driver,
    driver: instance.driver,
    instanceId: instanceId as ProviderInstanceId,
    liveProvider: undefined,
  }));
}

export function resolveConfiguredProviderEnabled(
  provider: ProviderRowModel,
  settings: {
    readonly providerInstances?: Readonly<Record<string, ProviderInstanceConfig>>;
    readonly providers: Record<string, { readonly enabled?: boolean } | undefined>;
  } | null
): boolean {
  if (!settings) return provider.configuredEnabled;
  return (
    settings.providerInstances?.[provider.instanceId]?.enabled ??
    settings.providers[provider.driver as keyof typeof settings.providers]?.enabled ??
    provider.configuredEnabled
  );
}