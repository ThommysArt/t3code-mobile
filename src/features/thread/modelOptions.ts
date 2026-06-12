import type {
  ModelSelection,
  ProviderOptionDescriptor,
  ProviderOptionSelectionValue,
  ServerConfig,
} from "@t3tools/contracts";

export interface ModelOption {
  readonly key: string;
  readonly label: string;
  readonly providerKey: string;
  readonly providerLabel: string;
  readonly providerDriver: string;
  readonly optionDescriptors: readonly ProviderOptionDescriptor[];
  readonly selection: ModelSelection;
}

export interface ProviderGroup {
  readonly providerKey: string;
  readonly providerLabel: string;
  readonly models: readonly ModelOption[];
}

function providerLabel(provider: ServerConfig["providers"][number]): string {
  if (provider.displayName) return provider.displayName;
  if (provider.driver === "codex") return "Codex";
  if (provider.driver === "claudeAgent") return "Claude";
  return provider.instanceId;
}

export function buildModelOptions(
  config: ServerConfig | null | undefined,
  fallback: ModelSelection | null
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
        providerKey: provider.instanceId,
        providerLabel: providerLabel(provider),
        providerDriver: provider.driver,
        optionDescriptors: model.capabilities?.optionDescriptors ?? [],
        selection: buildModelSelection(
          provider.instanceId,
          model.slug,
          model.capabilities?.optionDescriptors ?? []
        ),
      });
    }
  }

  if (fallback) {
    const fallbackKey = `${fallback.instanceId}:${fallback.model}`;
    if (!options.has(fallbackKey)) {
      options.set(fallbackKey, {
        key: fallbackKey,
        label: fallback.model,
        providerKey: fallback.instanceId,
        providerLabel: fallback.instanceId,
        providerDriver: fallback.instanceId,
        optionDescriptors: [],
        selection: fallback,
      });
    }
  }

  return [...options.values()];
}

function buildModelSelection(
  instanceId: string,
  model: string,
  descriptors: readonly ProviderOptionDescriptor[]
): ModelSelection {
  const selections: { id: string; value: ProviderOptionSelectionValue }[] = [];
  for (const descriptor of descriptors) {
    if (descriptor.type === "boolean") {
      if (descriptor.currentValue !== undefined) {
        selections.push({ id: descriptor.id, value: descriptor.currentValue });
      }
      continue;
    }
    const value =
      descriptor.currentValue ?? descriptor.options.find((option) => option.isDefault)?.id;
    if (value) selections.push({ id: descriptor.id, value });
  }
  const base = { instanceId, model } as ModelSelection;
  return selections.length > 0 ? { ...base, options: selections } : base;
}

export function normalizeModelSelection(selection: ModelSelection): ModelSelection {
  const options = selection.options;
  if (options === undefined || options.length === 0) {
    return { instanceId: selection.instanceId, model: selection.model };
  }
  return selection;
}

export function groupModelOptions(options: readonly ModelOption[]): readonly ProviderGroup[] {
  const groups = new Map<string, { label: string; models: ModelOption[] }>();
  for (const option of options) {
    const group = groups.get(option.providerKey);
    if (group) group.models.push(option);
    else {
      groups.set(option.providerKey, {
        label: option.providerLabel,
        models: [option],
      });
    }
  }
  return [...groups.entries()].map(([providerKey, group]) => ({
    providerKey,
    providerLabel: group.label,
    models: group.models,
  }));
}

export function modelOptionsForConversation(
  options: readonly ModelOption[],
  selection: ModelSelection | null,
  lockedProvider: boolean
): readonly ModelOption[] {
  if (!lockedProvider || !selection) return options;
  return options.filter((option) => option.selection.instanceId === selection.instanceId);
}

export function setModelSelectionOption(
  selection: ModelSelection,
  id: string,
  value: ProviderOptionSelectionValue
): ModelSelection {
  return {
    ...selection,
    options: [...(selection.options ?? []).filter((option) => option.id !== id), { id, value }],
  };
}

export function getModelSelectionOption(
  selection: ModelSelection,
  id: string
): ProviderOptionSelectionValue | undefined {
  return selection.options?.find((option) => option.id === id)?.value;
}

export function getDescriptorDefaultValue(
  descriptor: ProviderOptionDescriptor
): ProviderOptionSelectionValue | undefined {
  if (descriptor.currentValue !== undefined) return descriptor.currentValue;
  if (descriptor.type === "select") {
    return descriptor.options.find((option) => option.isDefault)?.id;
  }
  return undefined;
}

export function thinkingOptionDescriptors(
  option: ModelOption | null
): readonly ProviderOptionDescriptor[] {
  return (option?.optionDescriptors ?? []).filter((descriptor) => {
    const id = descriptor.id.toLowerCase();
    const label = descriptor.label.toLowerCase();
    return (
      id.includes("effort") ||
      id.includes("reasoning") ||
      id.includes("thinking") ||
      label.includes("effort") ||
      label.includes("reasoning") ||
      label.includes("thinking")
    );
  });
}
