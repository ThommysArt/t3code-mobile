import { ProviderInstanceId, type ServerConfig } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import { buildModelOptions } from "./modelOptions";

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
          models: [{ slug: "gpt-5.4", name: "GPT-5.4" }],
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

    expect(
      buildModelOptions(config, {
        instanceId: codex,
        model: "custom-model",
      })
    ).toEqual([
      {
        key: "codex-main:gpt-5.4",
        label: "GPT-5.4",
        providerLabel: "Work Codex",
        selection: { instanceId: codex, model: "gpt-5.4" },
      },
      {
        key: "codex-main:custom-model",
        label: "custom-model",
        providerLabel: codex,
        selection: { instanceId: codex, model: "custom-model" },
      },
    ]);
  });
});
