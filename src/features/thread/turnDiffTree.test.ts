import { describe, expect, it } from "vitest";

import {
  buildTurnDiffTree,
  formatCompactDiffCount,
  summarizeTurnDiffStats,
} from "./turnDiffTree";

describe("summarizeTurnDiffStats", () => {
  it("sums only files with numeric additions/deletions", () => {
    const stat = summarizeTurnDiffStats([
      { path: "README.md", kind: "modified", additions: 3, deletions: 1 },
      { path: "docs/notes.md", kind: "modified", additions: 0, deletions: 0 },
      { path: "src/index.ts", kind: "modified", additions: 5, deletions: 2 },
    ]);

    expect(stat).toEqual({ additions: 8, deletions: 3 });
  });
});

describe("formatCompactDiffCount", () => {
  it("formats small and large counts", () => {
    expect(formatCompactDiffCount(42)).toBe("42");
    expect(formatCompactDiffCount(1200)).toBe("1.2k");
    expect(formatCompactDiffCount(15_000)).toBe("15k");
  });
});

describe("buildTurnDiffTree", () => {
  it("builds nested directory nodes with aggregated stats", () => {
    const tree = buildTurnDiffTree([
      { path: "src/index.ts", kind: "modified", additions: 2, deletions: 1 },
      { path: "src/components/Button.tsx", kind: "modified", additions: 4, deletions: 2 },
      { path: "README.md", kind: "modified", additions: 1, deletions: 0 },
    ]);

    expect(tree).toEqual([
      {
        kind: "directory",
        name: "src",
        path: "src",
        stat: { additions: 6, deletions: 3 },
        children: [
          {
            kind: "directory",
            name: "components",
            path: "src/components",
            stat: { additions: 4, deletions: 2 },
            children: [
              {
                kind: "file",
                name: "Button.tsx",
                path: "src/components/Button.tsx",
                stat: { additions: 4, deletions: 2 },
              },
            ],
          },
          {
            kind: "file",
            name: "index.ts",
            path: "src/index.ts",
            stat: { additions: 2, deletions: 1 },
          },
        ],
      },
      {
        kind: "file",
        name: "README.md",
        path: "README.md",
        stat: { additions: 1, deletions: 0 },
      },
    ]);
  });

  it("compacts single-directory chains", () => {
    const tree = buildTurnDiffTree([
      { path: "apps/web/src/index.ts", kind: "modified", additions: 2, deletions: 1 },
    ]);

    expect(tree).toEqual([
      {
        kind: "directory",
        name: "apps/web/src",
        path: "apps/web/src",
        stat: { additions: 2, deletions: 1 },
        children: [
          {
            kind: "file",
            name: "index.ts",
            path: "apps/web/src/index.ts",
            stat: { additions: 2, deletions: 1 },
          },
        ],
      },
    ]);
  });

  it("normalizes windows separators", () => {
    const tree = buildTurnDiffTree([
      { path: "apps\\web\\src\\index.ts", kind: "modified", additions: 2, deletions: 1 },
    ]);

    expect(tree[0]).toMatchObject({
      kind: "directory",
      name: "apps/web/src",
      path: "apps/web/src",
    });
  });
});
