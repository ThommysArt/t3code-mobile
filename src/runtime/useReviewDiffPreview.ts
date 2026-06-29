import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, ReviewDiffPreviewResult } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useCallback, useMemo } from "react";

import { appAtomRegistry } from "./atom-registry";
import { useEnvironments } from "./EnvironmentProvider";

const REVIEW_DIFF_PREVIEW_STALE_TIME_MS = 5_000;
const REVIEW_DIFF_PREVIEW_IDLE_TTL_MS = 5 * 60_000;
const REVIEW_DIFF_PREVIEW_KEY_SEPARATOR = "\u001f";

export interface ReviewDiffPreviewState {
  readonly data: ReviewDiffPreviewResult | null;
  readonly error: string | null;
  readonly isPending: boolean;
  readonly refresh: () => void;
}

let resolveReviewClient: (
  environmentId: EnvironmentId
) => { getDiffPreview: (input: { cwd: string }) => Promise<ReviewDiffPreviewResult> } | null =
  () => null;

function makeReviewDiffPreviewKey(input: {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
}): string {
  return `${input.environmentId}${REVIEW_DIFF_PREVIEW_KEY_SEPARATOR}${input.cwd}`;
}

function parseReviewDiffPreviewKey(key: string): {
  readonly environmentId: EnvironmentId;
  readonly cwd: string;
} {
  const [environmentId, cwd = ""] = key.split(REVIEW_DIFF_PREVIEW_KEY_SEPARATOR);
  return {
    environmentId: environmentId as EnvironmentId,
    cwd,
  };
}

const reviewDiffPreviewAtom = Atom.family((key: string) =>
  Atom.make(
    Effect.promise(async (): Promise<ReviewDiffPreviewResult> => {
      const target = parseReviewDiffPreviewKey(key);
      const client = resolveReviewClient(target.environmentId);
      if (!client) {
        throw new Error("Remote connection is not ready.");
      }
      return client.getDiffPreview({ cwd: target.cwd });
    })
  ).pipe(
    Atom.swr({
      staleTime: REVIEW_DIFF_PREVIEW_STALE_TIME_MS,
      revalidateOnMount: true,
    }),
    Atom.setIdleTTL(REVIEW_DIFF_PREVIEW_IDLE_TTL_MS),
    Atom.withLabel(`mobile:review:diff-preview:${key}`)
  )
);

const EMPTY_REVIEW_DIFF_PREVIEW_RESULT_ATOM = Atom.make(
  AsyncResult.initial<ReviewDiffPreviewResult, never>(false)
).pipe(Atom.keepAlive, Atom.withLabel("mobile:review:diff-preview:null"));

function readReviewDiffPreviewError(
  result: AsyncResult.AsyncResult<ReviewDiffPreviewResult, unknown>
): string | null {
  if (result._tag !== "Failure") {
    return null;
  }

  const error = Cause.squash(result.cause);
  return error instanceof Error ? error.message : "Failed to load review diffs.";
}

export function useReviewDiffPreview(input: {
  readonly environmentId?: EnvironmentId;
  readonly cwd: string | null;
  readonly enabled?: boolean;
}): ReviewDiffPreviewState {
  const { getClient } = useEnvironments();
  const key = useMemo(() => {
    if (!input.environmentId || !input.cwd || input.enabled === false) {
      return null;
    }
    return makeReviewDiffPreviewKey({ environmentId: input.environmentId, cwd: input.cwd });
  }, [input.cwd, input.enabled, input.environmentId]);

  resolveReviewClient = (id) => getClient(id)?.review ?? null;

  const atom = key ? reviewDiffPreviewAtom(key) : null;
  const result = useAtomValue(atom ?? EMPTY_REVIEW_DIFF_PREVIEW_RESULT_ATOM);
  const refresh = useCallback(() => {
    if (atom) {
      appAtomRegistry.refresh(atom);
    }
  }, [atom]);

  if (!atom) {
    return {
      data: null,
      error: null,
      isPending: false,
      refresh,
    };
  }

  return {
    data: Option.getOrNull(AsyncResult.value(result)),
    error: readReviewDiffPreviewError(result),
    isPending: result.waiting,
    refresh,
  };
}