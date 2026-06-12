import { ProviderInstanceId, type ServerConfig } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import {
  buildModelOptions,
  getDescriptorDefaultValue,
  getModelSelectionOption,
  groupModelOptions,
  modelOptionsForConversation,
  normalizeModelSelection,
  setModelSelectionOption,
  thinkingOptionDescriptors,
} from "./modelOptions";

describe("buildModelOptions", () => {
  it("includes usable server models and preserves the current fallback", () => {
    const codex = ProviderInstanceId.make("codex-main");
    const disabled = ProviderInstanceId.make("disabled");
    const config = {
      providers: [
        {
          instanceId: codex,
          driver: "codex",
          displayName: "Work Codex",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          models: [
            {
              slug: "gpt-5.4",
              name: "GPT-5.4",
              capabilities: {
                optionDescriptors: [
                  {
                    id: "reasoning_effort",
                    label: "Reasoning effort",
                    type: "select",
                    options: [
                      { id: "low", label: "Low" },
                      { id: "high", label: "High", isDefault: true },
                    ],
                  },
                  {
                    id: "fast_mode",
                    label: "Fast mode",
                    type: "boolean",
                    currentValue: false,
                  },
                ],
              },
            },
          ],
        },
        {
          instanceId: disabled,
          driver: "claudeAgent",
          enabled: false,
          installed: true,
          auth: { status: "authenticated" },
          models: [{ slug: "claude-opus", name: "Claude Opus" }],
        },
      ],
    } as unknown as ServerConfig;

    const options = buildModelOptions(config, {
      instanceId: codex,
      model: "custom-model",
    });

    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({
      key: "codex-main:gpt-5.4",
      label: "GPT-5.4",
      providerKey: codex,
      providerLabel: "Work Codex",
      providerDriver: "codex",
      selection: {
        instanceId: codex,
        model: "gpt-5.4",
        options: [
          { id: "reasoning_effort", value: "high" },
          { id: "fast_mode", value: false },
        ],
      },
    });
    expect(options[1]).toMatchObject({
      key: "codex-main:custom-model",
      label: "custom-model",
      providerKey: codex,
      providerLabel: codex,
      selection: { instanceId: codex, model: "custom-model" },
    });
    expect(
      thinkingOptionDescriptors(options[0] ?? null).map((descriptor) => descriptor.id)
    ).toEqual(["reasoning_effort"]);
    expect(getDescriptorDefaultValue(options[0]!.optionDescriptors[0]!)).toBe("high");
  });

  it("groups models by provider and locks existing conversations to their provider", () => {
    const codex = ProviderInstanceId.make("codex-main");
    const claude = ProviderInstanceId.make("claude-main");
    const config = {
      providers: [
        {
          instanceId: codex,
          driver: "codex",
          displayName: "Codex",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          models: [{ slug: "gpt-5.4", name: "GPT-5.4" }],
        },
        {
          instanceId: claude,
          driver: "claudeAgent",
          displayName: "Claude",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          models: [{ slug: "sonnet", name: "Sonnet" }],
        },
      ],
    } as unknown as ServerConfig;
    const selection = { instanceId: codex, model: "gpt-5.4" };
    const options = buildModelOptions(config, selection);

    expect(groupModelOptions(options).map((group) => group.providerLabel)).toEqual([
      "Codex",
      "Claude",
    ]);
    expect(
      modelOptionsForConversation(options, selection, true).map((option) => option.label)
    ).toEqual(["GPT-5.4"]);
    expect(modelOptionsForConversation(options, selection, false)).toEqual(options);
  });

  it("omits options when a model has no provider option descriptors", () => {
    const codex = ProviderInstanceId.make("codex-main");
    const config = {
      providers: [
        {
          instanceId: codex,
          driver: "codex",
          displayName: "Codex",
          enabled: true,
          installed: true,
          auth: { status: "authenticated" },
          models: [{ slug: "gpt-5.4", name: "GPT-5.4" }],
        },
      ],
    } as unknown as ServerConfig;

    const [option] = buildModelOptions(config, null);

    expect(option?.selection).toEqual({
      instanceId: codex,
      model: "gpt-5.4",
    });
    expect("options" in (option?.selection ?? {})).toBe(false);
    expect(thinkingOptionDescriptors(option ?? null)).toEqual([]);
  });

  it("strips empty or undefined options before dispatch", () => {
    const codex = ProviderInstanceId.make("codex-main");
    expect(
      normalizeModelSelection({
        instanceId: codex,
        model: "gpt-5.4",
        options: undefined,
      })
    ).toEqual({
      instanceId: codex,
      model: "gpt-5.4",
    });
    expect(
      normalizeModelSelection({
        instanceId: codex,
        model: "gpt-5.4",
        options: [],
      })
    ).toEqual({
      instanceId: codex,
      model: "gpt-5.4",
    });
  });

  it("updates one advertised option without dropping the others", () => {
    const codex = ProviderInstanceId.make("codex-main");
    const selection = {
      instanceId: codex,
      model: "gpt-5.4",
      options: [
        { id: "reasoning_effort", value: "medium" },
        { id: "fast_mode", value: false },
      ],
    };

    const updated = setModelSelectionOption(selection, "reasoning_effort", "high");

    expect(getModelSelectionOption(updated, "reasoning_effort")).toBe("high");
    expect(getModelSelectionOption(updated, "fast_mode")).toBe(false);
  });
});
