import {
  canNavigateUp,
  ensureBrowseDirectoryPath,
  getBrowseDirectoryPath,
  getBrowseParentPath,
  inferProjectTitleFromPath,
} from "@t3tools/client-runtime";
import { PROJECT_READ_FILE_DEFAULT_MAX_BYTES } from "@t3tools/contracts";
import type { EnvironmentId } from "@t3tools/contracts";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { AppIcon } from "@/components/AppIcon";
import { FileTypeIcon, fileIconKindForName } from "@/features/files/FileTypeIcon";
import {
  joinWorkspacePath,
  relativePathWithinWorkspace,
} from "@/features/files/workspacePath";
import { useEnvironments } from "@/runtime/EnvironmentProvider";
import { useFilesystemBrowse } from "@/runtime/useFilesystemBrowse";
import { workspaceLog } from "./workspaceLog";

interface ListedEntry {
  readonly path: string;
  readonly relativePath: string;
  readonly name: string;
  readonly kind: "file" | "directory";
}

function resolveReadRelativePath(workspaceRoot: string, entry: ListedEntry): string {
  if (entry.relativePath.length > 0) {
    return entry.relativePath;
  }

  return relativePathWithinWorkspace(workspaceRoot, entry.path);
}

function browseEntryOrder(left: ListedEntry, right: ListedEntry): number {
  if (left.kind !== right.kind) {
    return left.kind === "directory" ? -1 : 1;
  }
  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
}

function isProbablyTextFile(name: string): boolean {
  const lower = name.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|wasm|bin|exe|dll|so|dylib)$/i.test(lower)) {
    return false;
  }
  return true;
}

function matchesParentDirectory(
  parentPath: string | undefined,
  currentRelativeDir: string
): boolean {
  const normalizedParent = parentPath ?? "";
  return normalizedParent === currentRelativeDir;
}

function listQueryForDirectory(currentRelativeDir: string): string {
  return currentRelativeDir.length > 0 ? currentRelativeDir : ".";
}

function buildBreadcrumbs(
  workspaceRoot: string,
  currentDirectoryPath: string
): ReadonlyArray<{ readonly label: string; readonly path: string }> {
  const directoryPath = ensureBrowseDirectoryPath(currentDirectoryPath);
  const relative = relativePathWithinWorkspace(workspaceRoot, getBrowseDirectoryPath(directoryPath));
  const rootLabel = inferProjectTitleFromPath(workspaceRoot);
  const crumbs: Array<{ readonly label: string; readonly path: string }> = [
    { label: rootLabel, path: ensureBrowseDirectoryPath(workspaceRoot) },
  ];

  if (relative.length === 0) {
    return crumbs;
  }

  const segments = relative.split("/").filter((segment) => segment.length > 0);
  let accumulated = "";
  for (const segment of segments) {
    accumulated = accumulated.length > 0 ? `${accumulated}/${segment}` : segment;
    crumbs.push({
      label: segment,
      path: ensureBrowseDirectoryPath(joinWorkspacePath(workspaceRoot, accumulated)),
    });
  }

  return crumbs;
}

export const WorkspaceFilesTab = memo(function WorkspaceFilesTab(props: {
  readonly environmentId: EnvironmentId;
  readonly workspaceRoot: string;
  readonly platform: string;
  readonly live: boolean;
}) {
  const { getClient } = useEnvironments();
  const [currentDirectoryPath, setCurrentDirectoryPath] = useState(() =>
    ensureBrowseDirectoryPath(props.workspaceRoot)
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [directoryFiles, setDirectoryFiles] = useState<readonly ListedEntry[]>([]);
  const [filesPending, setFilesPending] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [filesTruncated, setFilesTruncated] = useState(false);
  const [searchResults, setSearchResults] = useState<readonly ListedEntry[]>([]);
  const [searchPending, setSearchPending] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<ListedEntry | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewTruncated, setPreviewTruncated] = useState(false);
  const [previewPending, setPreviewPending] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const browseDirectoryPath = useMemo(
    () => ensureBrowseDirectoryPath(currentDirectoryPath),
    [currentDirectoryPath]
  );
  const browseInput = useMemo(
    () => ({
      partialPath: browseDirectoryPath,
      cwd: props.workspaceRoot,
    }),
    [browseDirectoryPath, props.workspaceRoot]
  );
  const browseState = useFilesystemBrowse(
    props.live ? props.environmentId : null,
    browseInput
  );
  const currentRelativeDir = useMemo(
    () => relativePathWithinWorkspace(props.workspaceRoot, browseDirectoryPath),
    [browseDirectoryPath, props.workspaceRoot]
  );
  const breadcrumbs = useMemo(
    () => buildBreadcrumbs(props.workspaceRoot, browseDirectoryPath),
    [browseDirectoryPath, props.workspaceRoot]
  );
  const visibleDirectories = useMemo(
    () =>
      [...(browseState.data?.entries ?? [])]
        .filter((entry) => !entry.name.startsWith("."))
        .map(
          (entry): ListedEntry => ({
            name: entry.name,
            path: ensureBrowseDirectoryPath(entry.fullPath),
            relativePath: relativePathWithinWorkspace(
              props.workspaceRoot,
              ensureBrowseDirectoryPath(entry.fullPath)
            ),
            kind: "directory",
          })
        )
        .sort(browseEntryOrder),
    [browseState.data?.entries]
  );
  const parentBrowsePath = getBrowseParentPath(browseDirectoryPath);
  const canBrowseUpPath = canNavigateUp(browseDirectoryPath);

  useEffect(() => {
    setCurrentDirectoryPath(ensureBrowseDirectoryPath(props.workspaceRoot));
  }, [props.workspaceRoot]);

  useEffect(() => {
    const trimmedSearch = searchQuery.trim();
    if (!props.live || trimmedSearch.length >= 2) {
      return;
    }

    const client = getClient(props.environmentId);
    if (!client) return;

    let cancelled = false;
    setFilesPending(true);
    setFilesError(null);
    setFilesTruncated(false);

    workspaceLog("files", "list:start", { directory: currentRelativeDir });

    void client.projects
      .searchEntries({
        cwd: props.workspaceRoot,
        query: listQueryForDirectory(currentRelativeDir),
        limit: 200,
      })
      .then((result) => {
        if (cancelled) return;

        const files = result.entries
          .filter((entry) => entry.kind === "file")
          .filter((entry) => matchesParentDirectory(entry.parentPath, currentRelativeDir))
          .map(
            (entry): ListedEntry => ({
              name: entry.path.split("/").pop() ?? entry.path,
              path: joinWorkspacePath(props.workspaceRoot, entry.path),
              relativePath: entry.path,
              kind: "file",
            })
          )
          .sort(browseEntryOrder);

        setDirectoryFiles(files);
        setFilesTruncated(result.truncated);
        setFilesPending(false);
        workspaceLog("files", "list:done", {
          directory: currentRelativeDir,
          fileCount: files.length,
          truncated: result.truncated,
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setFilesError(error instanceof Error ? error.message : "Failed to list files.");
        setDirectoryFiles([]);
        setFilesPending(false);
        workspaceLog("files", "list:error", {
          directory: currentRelativeDir,
          message: error instanceof Error ? error.message : String(error),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    currentRelativeDir,
    getClient,
    props.environmentId,
    props.live,
    props.workspaceRoot,
    searchQuery,
  ]);

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!props.live || trimmed.length < 2) {
      setSearchResults([]);
      setSearchPending(false);
      setSearchError(null);
      return;
    }

    const client = getClient(props.environmentId);
    if (!client) return;

    let cancelled = false;
    setSearchPending(true);
    setSearchError(null);

    workspaceLog("files", "search:start", { query: trimmed });

    void client.projects
      .searchEntries({
        cwd: props.workspaceRoot,
        query: trimmed,
        limit: 50,
      })
      .then((result) => {
        if (cancelled) return;
        workspaceLog("files", "search:done", {
          query: trimmed,
          resultCount: result.entries.length,
        });
        setSearchResults(
          result.entries.map((entry) => ({
            name: entry.path.split("/").pop() ?? entry.path,
            path:
              entry.kind === "directory"
                ? ensureBrowseDirectoryPath(joinWorkspacePath(props.workspaceRoot, entry.path))
                : joinWorkspacePath(props.workspaceRoot, entry.path),
            relativePath: entry.path,
            kind: entry.kind,
          }))
        );
        setSearchPending(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setSearchError(error instanceof Error ? error.message : "Search failed.");
        setSearchResults([]);
        setSearchPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [getClient, props.environmentId, props.live, props.workspaceRoot, searchQuery]);

  const loadPreview = useCallback(
    async (entry: ListedEntry) => {
      setSelectedEntry(entry);
      setPreviewText(null);
      setPreviewTruncated(false);
      setPreviewError(null);

      if (entry.kind !== "file" || !isProbablyTextFile(entry.name)) {
        setPreviewError("Preview is only available for text files.");
        return;
      }

      const client = getClient(props.environmentId);
      if (!client) {
        setPreviewError("Connection is not ready.");
        return;
      }

      const relativePath = resolveReadRelativePath(props.workspaceRoot, entry);
      if (relativePath.length === 0) {
        setPreviewError("Cannot preview this path.");
        return;
      }

      setPreviewPending(true);
      workspaceLog("files", "preview:start", { path: relativePath });
      try {
        const result = await client.projects.readFile({
          cwd: props.workspaceRoot,
          relativePath,
          maxBytes: PROJECT_READ_FILE_DEFAULT_MAX_BYTES,
        });
        setPreviewText(result.contents);
        setPreviewTruncated(result.truncated);
        workspaceLog("files", "preview:done", {
          path: relativePath,
          truncated: result.truncated,
          bytes: result.contents.length,
        });
      } catch (error: unknown) {
        setPreviewError(error instanceof Error ? error.message : "Failed to load file preview.");
        workspaceLog("files", "preview:error", {
          path: relativePath,
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setPreviewPending(false);
      }
    },
    [getClient, props.environmentId, props.workspaceRoot]
  );

  const openDirectory = useCallback((fullPath: string) => {
    setSelectedEntry(null);
    setPreviewText(null);
    setPreviewError(null);
    setCurrentDirectoryPath(ensureBrowseDirectoryPath(fullPath));
    setSearchQuery("");
    workspaceLog("files", "navigate", { path: fullPath });
  }, []);

  if (!props.live) {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <AppIcon name="wifi" size={28} color="#737373" />
        <Text className="text-center text-base font-semibold text-foreground">
          Live connection required
        </Text>
        <Text className="text-center text-sm leading-6 text-muted">
          File browsing needs an active WebSocket session to your T3 Code server.
        </Text>
      </View>
    );
  }

  const showingSearch = searchQuery.trim().length >= 2;
  const listedEntries = showingSearch
    ? searchResults
    : [...visibleDirectories, ...directoryFiles].sort(browseEntryOrder);
  const listPending = showingSearch ? searchPending : browseState.isPending || filesPending;

  return (
    <View className="flex-1">
      <View className="border-b border-border px-3 py-2">
        <View className="flex-row items-center gap-2">
          <TextInput
            accessibilityLabel="Search files"
            autoCapitalize="none"
            autoCorrect={false}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search files…"
            placeholderTextColor="#737373"
            className="min-w-0 flex-1 rounded-xl bg-default px-3 py-2 text-sm text-foreground"
          />
          <AppIcon name="search" size={18} color="#737373" />
        </View>

        {!showingSearch ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-2 max-h-8 flex-grow-0"
            contentContainerStyle={{ alignItems: "center", gap: 4 }}
          >
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <View key={crumb.path} className="flex-row items-center gap-1">
                  {index > 0 ? <Text className="text-xs text-muted">/</Text> : null}
                  <Pressable
                    accessibilityRole="button"
                    disabled={isLast}
                    onPress={() => openDirectory(crumb.path)}
                  >
                    <Text
                      className={`font-mono text-xs ${isLast ? "font-semibold text-foreground" : "text-accent"}`}
                      numberOfLines={1}
                    >
                      {crumb.label}
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        ) : null}
      </View>

      {browseState.error || searchError || filesError ? (
        <Text className="px-4 py-2 text-xs text-red-400">
          {browseState.error ?? searchError ?? filesError}
        </Text>
      ) : null}

      {!showingSearch && filesTruncated ? (
        <Text className="px-4 py-2 text-xs text-muted">
          Showing the first matches in this folder. Use search to find a specific file.
        </Text>
      ) : null}

      <ScrollView
        className="flex-1"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: selectedEntry ? 0 : 24 }}
      >
        {listPending && listedEntries.length === 0 ? (
          <View className="items-center py-8">
            <ActivityIndicator color="#f97316" />
          </View>
        ) : null}

        {!showingSearch && canBrowseUpPath && parentBrowsePath ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => openDirectory(parentBrowsePath)}
            className="flex-row items-center gap-3 border-b border-border px-4 py-3"
          >
            <FileTypeIcon kind="folder" />
            <Text className="text-sm text-muted">..</Text>
          </Pressable>
        ) : null}

        {listedEntries.length === 0 && !listPending ? (
          <Text className="px-4 py-6 text-center text-sm text-muted">
            {showingSearch ? "No matching files." : "This folder is empty."}
          </Text>
        ) : (
          listedEntries.map((entry) => (
            <Pressable
              key={entry.path}
              accessibilityRole="button"
              onPress={() => {
                if (entry.kind === "directory") {
                  openDirectory(entry.path);
                  return;
                }
                void loadPreview(entry);
              }}
              className={`flex-row items-center gap-3 border-b border-border px-4 py-3 ${
                selectedEntry?.path === entry.path ? "bg-default" : ""
              }`}
            >
              <FileTypeIcon kind={fileIconKindForName(entry.name, entry.kind)} />
              <Text className="min-w-0 flex-1 text-sm text-foreground" numberOfLines={2}>
                {showingSearch
                  ? entry.path.replace(`${props.workspaceRoot}/`, "").replace(/\/$/, "")
                  : entry.name}
              </Text>
              {entry.kind === "directory" ? (
                <AppIcon name="chevron-right" size={14} color="#737373" />
              ) : null}
            </Pressable>
          ))
        )}
      </ScrollView>

      {selectedEntry ? (
        <View
          className="border-t border-border bg-surface"
          style={{ flexShrink: 0, height: 280 }}
        >
          <View className="border-b border-border px-4 py-2">
            <Text className="font-mono text-xs font-semibold text-foreground" numberOfLines={2}>
              {selectedEntry.relativePath || selectedEntry.name}
            </Text>
          </View>
          <ScrollView
            style={{ flex: 1 }}
            className="px-4 py-3"
            contentContainerStyle={{ paddingBottom: 16 }}
          >
            {previewPending ? <ActivityIndicator color="#f97316" /> : null}
            {previewError ? <Text className="text-xs text-red-400">{previewError}</Text> : null}
            {previewTruncated ? (
              <Text className="mb-2 text-xs text-muted">Preview truncated for large files.</Text>
            ) : null}
            {previewText ? (
              <Text className="font-mono text-[11px] leading-5 text-foreground" selectable>
                {previewText}
              </Text>
            ) : null}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
});