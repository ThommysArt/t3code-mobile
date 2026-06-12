import {
  defaultInstanceIdForDriver,
  type ProviderDriverKind,
  type ProviderInstanceConfig,
  type ProviderInstanceId,
  type ServerSettings,
  type ServerSettingsPatch,
} from "@t3tools/contracts";

export function buildProviderEnabledPatch(
  settings: ServerSettings,
  instanceId: ProviderInstanceId,
  driver: string,
  enabled: boolean
): ServerSettingsPatch {
  const driverKind = driver as ProviderDriverKind;
  const explicitInstance = settings.providerInstances?.[instanceId];
  const legacyKey = driverKind as keyof ServerSettings["providers"];
  const legacyConfig = settings.providers[legacyKey];
  const isDefault = instanceId === defaultInstanceIdForDriver(driverKind);

  const effectiveInstance: ProviderInstanceConfig =
    explicitInstance ??
    ({
      driver: driverKind,
      enabled: legacyConfig?.enabled ?? true,
      config: legacyConfig,
    } satisfies ProviderInstanceConfig);

  const providerInstances = {
    ...settings.providerInstances,
    [instanceId]: {
      ...effectiveInstance,
      enabled,
    },
  };

  if (isDefault && legacyConfig) {
    return {
      providerInstances,
      providers: {
        [driverKind]: {
          ...legacyConfig,
          enabled,
        },
      } as ServerSettingsPatch["providers"],
    };
  }

  return { providerInstances };
}