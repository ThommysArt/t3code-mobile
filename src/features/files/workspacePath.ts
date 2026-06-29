export function normalizeAbsolutePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

export function relativePathWithinWorkspace(workspaceRoot: string, absolutePath: string): string {
  const root = normalizeAbsolutePath(workspaceRoot);
  const target = normalizeAbsolutePath(absolutePath);
  if (target === root) {
    return "";
  }
  const prefix = `${root}/`;
  if (target.startsWith(prefix)) {
    return target.slice(prefix.length);
  }
  return target;
}

export function joinWorkspacePath(workspaceRoot: string, relativePath: string): string {
  const root = normalizeAbsolutePath(workspaceRoot);
  const relative = relativePath.replace(/^\/+/, "");
  return relative.length === 0 ? root : `${root}/${relative}`;
}

export function parentRelativePath(relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, "/").replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  if (index < 0) {
    return null;
  }
  return normalized.slice(0, index);
}