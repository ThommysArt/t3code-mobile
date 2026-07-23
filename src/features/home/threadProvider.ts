import type { EnvironmentScopedThreadShell } from "@t3tools/client-runtime";
import type { ServerConfig } from "@t3tools/contracts";

export interface ThreadProviderPresentation {
  readonly driver: string;
  readonly label: string;
}

/**
 * Resolve the agent provider driving a thread session, preferring the
 * server's provider snapshot (driver + display name) over raw session fields.
 */
export function resolveThreadProvider(
  thread: EnvironmentScopedThreadShell,
  serverConfig: ServerConfig | null | undefined
): ThreadProviderPresentation | null {
  const session = thread.session;
  if (!session) return null;

  const instanceId = session.providerInstanceId;
  if (instanceId && serverConfig?.providers) {
    const provider = serverConfig.providers.find((entry) => entry.instanceId === instanceId);
    if (provider) {
      return {
        driver: provider.driver,
        label: provider.displayName ?? session.providerName ?? provider.driver,
      };
    }
  }

  if (session.providerName) {
    return {
      driver: session.providerName.toLowerCase(),
      label: session.providerName,
    };
  }

  return null;
}
