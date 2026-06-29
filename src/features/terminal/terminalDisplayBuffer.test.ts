import { describe, expect, it } from "vitest";

import { applyTerminalDisplayBuffer } from "./terminalDisplayBuffer";

describe("applyTerminalDisplayBuffer", () => {
  it("returns empty string for empty input", () => {
    expect(applyTerminalDisplayBuffer("")).toBe("");
  });

  it("strips non-clear CSI sequences", () => {
    expect(applyTerminalDisplayBuffer("hello\u001b[31m world")).toBe("hello world");
  });

  it("clears visible output when clear-screen sequence is received", () => {
    const buffer = "prompt$ ls\nfile.txt\u001b[2Jfresh prompt$ ";
    expect(applyTerminalDisplayBuffer(buffer)).toBe("fresh prompt$ ");
  });

  it("handles multiple clear sequences", () => {
    const buffer = "a\u001b[2Jb\u001b[3Jc";
    expect(applyTerminalDisplayBuffer(buffer)).toBe("c");
  });

  it("preserves plain text without escape codes", () => {
    expect(applyTerminalDisplayBuffer("line one\nline two")).toBe("line one\nline two");
  });
});