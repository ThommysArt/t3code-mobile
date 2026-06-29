import { describe, expect, it } from "vitest";

import { nextTerminalId } from "@t3tools/shared/terminalLabels";

describe("workspace terminal tab ids", () => {
  it("allocates independent terminal ids for each new tab", () => {
    const first = nextTerminalId([]);
    const second = nextTerminalId([first]);
    const third = nextTerminalId([first, second]);

    expect(first).toBe("term-1");
    expect(second).toBe("term-2");
    expect(third).toBe("term-3");
  });
});