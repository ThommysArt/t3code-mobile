import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";

import { KeybindingCommand, ResolvedKeybindingsConfig } from "./keybindings";

const decodeKeybindingCommand = Schema.decodeUnknownOption(KeybindingCommand);
const decodeResolvedKeybindingsConfig = Schema.decodeUnknownOption(ResolvedKeybindingsConfig);

describe("keybinding contracts", () => {
  it("accepts the current upstream sidebar toggle command", () => {
    expect(Option.isSome(decodeKeybindingCommand("sidebar.toggle"))).toBe(true);
  });

  it("decodes resolved keybindings from server config snapshots", () => {
    const decoded = decodeResolvedKeybindingsConfig([
      {
        command: "sidebar.toggle",
        shortcut: {
          key: "b",
          metaKey: false,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
          modKey: true,
        },
      },
    ]);

    expect(Option.isSome(decoded)).toBe(true);
  });
});
