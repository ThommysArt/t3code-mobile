import type { ModelSelection, ServerConfig } from "@t3tools/contracts";

export interface ModelOption {
  readonly key: string;
  readonly label: string;
  readonly providerLabel: string;
  readonly selection: ModelSelection;
}

function providerLabel(provider: ServerConfig["providers"][number]): string {
  if (provider.displayName) return provider.displayName;
  if (provider.driver === "codex") return "Codex";
  if (provider.driver === "claudeAgent") return "Claude";
  return provider.instanceId;
}

export function buildModelOptions(
  config: ServerConfig | null | undefined,
  fallback: ModelSelection
): readonly ModelOption[] {
  const options = new Map<string, ModelOption>();

  for (const provider of config?.providers ?? []) {
    if (!provider.enabled || !provider.installed || provider.auth.status === "unauthenticated") {
      continue;
    }

    for (const model of provider.models) {
      const key = `${provider.instanceId}:${model.slug}`;
      options.set(key, {
        key,
        label: model.name,
        providerLabel: providerLabel(provider),
        selection: {
          instanceId: provider.instanceId,
          model: model.slug,
        },
      });
    }
  }

  const fallbackKey = `${fallback.instanceId}:${fallback.model}`;
  if (!options.has(fallbackKey)) {
    options.set(fallbackKey, {
      key: fallbackKey,
      label: fallback.model,
      providerLabel: fallback.instanceId,
      selection: fallback,
    });
  }

  return [...options.values()];
}
