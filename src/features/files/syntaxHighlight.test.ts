import { describe, expect, it } from "vitest";

import { highlightSource } from "./syntaxHighlight";

describe("highlightSource", () => {
  it("highlights typescript keywords and strings", () => {
    const lines = highlightSource('const message = "hello";', "typescript");
    expect(lines).toHaveLength(1);
    expect(lines[0]?.some((token) => token.kind === "keyword" && token.text === "const")).toBe(true);
    expect(lines[0]?.some((token) => token.kind === "string")).toBe(true);
  });

  it("highlights json property keys", () => {
    const lines = highlightSource('  "name": "t3code"', "json");
    expect(lines[0]?.some((token) => token.kind === "property")).toBe(true);
  });

  it("highlights markdown headings", () => {
    const lines = highlightSource("# Title", "markdown");
    expect(lines[0]?.[0]?.kind).toBe("keyword");
  });
});