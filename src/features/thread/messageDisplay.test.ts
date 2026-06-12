import { describe, expect, it } from "vitest";

import { shouldCollapsePrompt } from "./messageDisplay";

describe("shouldCollapsePrompt", () => {
  it("keeps short prompts expanded", () => {
    expect(shouldCollapsePrompt("Fix the keyboard behavior.")).toBe(false);
  });

  it("collapses prompts with more than seven explicit lines", () => {
    expect(
      shouldCollapsePrompt(Array.from({ length: 8 }, (_, index) => `Line ${index}`).join("\n"))
    ).toBe(true);
  });

  it("accounts for wrapped lines", () => {
    expect(shouldCollapsePrompt("x".repeat(300))).toBe(true);
  });
});
