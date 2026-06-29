import { useAtomValue } from "@effect/atom-react";
import {
  createFilesystemBrowseManager,
  EMPTY_FILESYSTEM_BROWSE_ATOM,
  EMPTY_FILESYSTEM_BROWSE_STATE,
  filesystemBrowseStateAtom,
  getFilesystemBrowseTargetKey,
  type FilesystemBrowseClient,
  type FilesystemBrowseState,
  type FilesystemBrowseTarget,
} from "@t3tools/client-runtime";
import type { EnvironmentId, FilesystemBrowseInput } from "@t3tools/contracts";
import { useEffect, useMemo } from "react";

import { appAtomRegistry } from "./atom-registry";
import { useEnvironments } from "./EnvironmentProvider";

let resolveFilesystemBrowseClient: (
  environmentId: EnvironmentId
) => FilesystemBrowseClient | null = () => null;

const filesystemBrowseManager = createFilesystemBrowseManager<EnvironmentId>({
  getRegistry: () => appAtomRegistry,
  getClient: (environmentId) => resolveFilesystemBrowseClient(environmentId),
});

function filesystemBrowseTargetForEnvironment(
  environmentId: EnvironmentId | null,
  input: FilesystemBrowseInput | null
): FilesystemBrowseTarget<EnvironmentId> {
  return { key: environmentId, input };
}

export function useFilesystemBrowse(
  environmentId: EnvironmentId | null,
  input: FilesystemBrowseInput | null
): FilesystemBrowseState {
  const { getClient } = useEnvironments();
  const target = useMemo(
    () => filesystemBrowseTargetForEnvironment(environmentId, input),
    [environmentId, input]
  );

  useEffect(() => {
    resolveFilesystemBrowseClient = (id) => getClient(id)?.filesystem ?? null;
    return filesystemBrowseManager.watch(target);
  }, [getClient, target]);

  const targetKey = getFilesystemBrowseTargetKey(target);
  const state = useAtomValue(
    targetKey !== null ? filesystemBrowseStateAtom(targetKey) : EMPTY_FILESYSTEM_BROWSE_ATOM
  );
  return targetKey === null ? EMPTY_FILESYSTEM_BROWSE_STATE : state;
}