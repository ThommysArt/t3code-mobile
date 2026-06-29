import { describe, expect, it } from "vitest";

import { countDiffLineChanges, parseUnifiedDiff, resolveDiffFilePath } from "./diffParser";

describe("parseUnifiedDiff", () => {
  it("parses a simple unified diff", () => {
    const diff = [
      "diff --git a/src/app.ts b/src/app.ts",
      "--- a/src/app.ts",
      "+++ b/src/app.ts",
      "@@ -1,2 +1,3 @@",
      " console.log('hi');",
      "+console.log('added');",
    ].join("\n");

    const files = parseUnifiedDiff(diff);
    expect(files).toHaveLength(1);
    expect(resolveDiffFilePath(files[0]!)).toBe("src/app.ts");
    expect(files[0]!.lines.some((line) => line.type === "add")).toBe(true);
    expect(countDiffLineChanges(files[0]!)).toEqual({ additions: 1, deletions: 0 });
  });
});