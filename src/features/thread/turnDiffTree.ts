export interface TurnDiffFileChange {
  readonly path: string;
  readonly kind?: string;
  readonly additions: number;
  readonly deletions: number;
}

export interface TurnDiffStat {
  readonly additions: number;
  readonly deletions: number;
}

export interface TurnDiffTreeDirectoryNode {
  readonly kind: "directory";
  readonly name: string;
  readonly path: string;
  readonly stat: TurnDiffStat;
  readonly children: ReadonlyArray<TurnDiffTreeNode>;
}

export interface TurnDiffTreeFileNode {
  readonly kind: "file";
  readonly name: string;
  readonly path: string;
  readonly stat: TurnDiffStat | null;
}

export type TurnDiffTreeNode = TurnDiffTreeDirectoryNode | TurnDiffTreeFileNode;

interface MutableDirectoryNode {
  name: string;
  path: string;
  stat: { additions: number; deletions: number };
  directories: Map<string, MutableDirectoryNode>;
  files: TurnDiffTreeFileNode[];
}

const SORT_LOCALE_OPTIONS: Intl.CollatorOptions = { numeric: true, sensitivity: "base" };

function normalizePathSegments(pathValue: string): string[] {
  return pathValue
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0);
}

function compareByName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, SORT_LOCALE_OPTIONS);
}

function readStat(file: TurnDiffFileChange): TurnDiffStat | null {
  if (typeof file.additions !== "number" || typeof file.deletions !== "number") {
    return null;
  }
  return {
    additions: file.additions,
    deletions: file.deletions,
  };
}

function compactDirectoryNode(node: TurnDiffTreeDirectoryNode): TurnDiffTreeDirectoryNode {
  const compactedChildren = node.children.map((child) =>
    child.kind === "directory" ? compactDirectoryNode(child) : child
  );

  let compactedNode: TurnDiffTreeDirectoryNode = {
    ...node,
    children: compactedChildren,
  };

  while (compactedNode.children.length === 1 && compactedNode.children[0]?.kind === "directory") {
    const onlyChild = compactedNode.children[0];
    compactedNode = {
      kind: "directory",
      name: `${compactedNode.name}/${onlyChild.name}`,
      path: onlyChild.path,
      stat: onlyChild.stat,
      children: onlyChild.children,
    };
  }

  return compactedNode;
}

function toTreeNodes(directory: MutableDirectoryNode): TurnDiffTreeNode[] {
  // Hermes does not implement Array.prototype.toSorted; sort a copy instead.
  const subdirectories: TurnDiffTreeDirectoryNode[] = Array.from(directory.directories.values())
    .sort(compareByName)
    .map<TurnDiffTreeDirectoryNode>((subdirectory) => ({
      kind: "directory",
      name: subdirectory.name,
      path: subdirectory.path,
      stat: {
        additions: subdirectory.stat.additions,
        deletions: subdirectory.stat.deletions,
      },
      children: toTreeNodes(subdirectory),
    }))
    .map((subdirectory) => compactDirectoryNode(subdirectory));

  const files = [...directory.files].sort(compareByName);
  return [...subdirectories, ...files];
}

export function summarizeTurnDiffStats(files: ReadonlyArray<TurnDiffFileChange>): TurnDiffStat {
  return files.reduce(
    (acc, file) => {
      const stat = readStat(file);
      if (!stat) return acc;
      return {
        additions: acc.additions + stat.additions,
        deletions: acc.deletions + stat.deletions,
      };
    },
    { additions: 0, deletions: 0 }
  );
}

export function buildTurnDiffTree(files: ReadonlyArray<TurnDiffFileChange>): TurnDiffTreeNode[] {
  const root: MutableDirectoryNode = {
    name: "",
    path: "",
    stat: { additions: 0, deletions: 0 },
    directories: new Map(),
    files: [],
  };

  for (const file of files) {
    const segments = normalizePathSegments(file.path);
    if (segments.length === 0) {
      continue;
    }

    const filePath = segments.join("/");
    const fileName = segments.at(-1);
    if (!fileName) {
      continue;
    }
    const stat = readStat(file);
    const ancestors: MutableDirectoryNode[] = [root];
    let currentDirectory = root;

    for (const segment of segments.slice(0, -1)) {
      const nextPath = currentDirectory.path ? `${currentDirectory.path}/${segment}` : segment;
      const existing = currentDirectory.directories.get(segment);
      if (existing) {
        currentDirectory = existing;
      } else {
        const created: MutableDirectoryNode = {
          name: segment,
          path: nextPath,
          stat: { additions: 0, deletions: 0 },
          directories: new Map(),
          files: [],
        };
        currentDirectory.directories.set(segment, created);
        currentDirectory = created;
      }
      ancestors.push(currentDirectory);
    }

    currentDirectory.files.push({
      kind: "file",
      name: fileName,
      path: filePath,
      stat,
    });

    if (stat) {
      for (const ancestor of ancestors) {
        ancestor.stat.additions += stat.additions;
        ancestor.stat.deletions += stat.deletions;
      }
    }
  }

  return toTreeNodes(root);
}

export function formatCompactDiffCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) {
    const k = value / 1000;
    return `${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}k`;
  }
  if (value < 1_000_000_000) {
    const m = value / 1_000_000;
    return `${m < 10 ? m.toFixed(1).replace(/\.0$/, "") : Math.round(m)}m`;
  }
  const b = value / 1_000_000_000;
  return `${b < 10 ? b.toFixed(1).replace(/\.0$/, "") : Math.round(b)}b`;
}

export function hasNonZeroStat(stat: TurnDiffStat | null | undefined): boolean {
  return Boolean(stat && (stat.additions > 0 || stat.deletions > 0));
}
