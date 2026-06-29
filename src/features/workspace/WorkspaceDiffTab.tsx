import type { EnvironmentId, OrchestrationCheckpointSummary, ThreadId } from "@t3tools/contracts";
import { memo, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";

import { AppIcon } from "@/components/AppIcon";
import { useChromeTheme } from "@/components/chrome/useChromeTheme";
import { UnifiedDiffView } from "@/features/diff/UnifiedDiffView";
import { useCheckpointDiff } from "@/runtime/useCheckpointDiff";
import { useReviewDiffPreview } from "@/runtime/useReviewDiffPreview";
import { workspaceLog } from "./workspaceLog";

type DiffMode = "thread" | "working-tree" | "checkpoint";

function maxCheckpointTurnCount(checkpoints: ReadonlyArray<OrchestrationCheckpointSummary>): number | null {
  if (checkpoints.length === 0) return null;
  return Math.max(...checkpoints.map((checkpoint) => checkpoint.checkpointTurnCount));
}

export const WorkspaceDiffTab = memo(function WorkspaceDiffTab(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly cwd: string | null;
  readonly checkpoints: ReadonlyArray<OrchestrationCheckpointSummary>;
  readonly live: boolean;
}) {
  const theme = useChromeTheme();
  const [mode, setMode] = useState<DiffMode>("thread");
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<OrchestrationCheckpointSummary | null>(
    null
  );

  const latestTurnCount = useMemo(
    () => maxCheckpointTurnCount(props.checkpoints),
    [props.checkpoints]
  );

  const threadDiff = useCheckpointDiff(
    {
      environmentId: props.environmentId,
      threadId: props.threadId,
      fromTurnCount: 0,
      toTurnCount: latestTurnCount,
      ignoreWhitespace: false,
      cacheScope: "workspace:thread",
    },
    { enabled: props.live && mode === "thread" && latestTurnCount !== null }
  );

  const checkpointDiff = useCheckpointDiff(
    {
      environmentId: props.environmentId,
      threadId: props.threadId,
      fromTurnCount: selectedCheckpoint
        ? Math.max(0, selectedCheckpoint.checkpointTurnCount - 1)
        : null,
      toTurnCount: selectedCheckpoint?.checkpointTurnCount ?? null,
      ignoreWhitespace: false,
      cacheScope: selectedCheckpoint ? `workspace:checkpoint:${selectedCheckpoint.turnId}` : null,
    },
    { enabled: props.live && mode === "checkpoint" && selectedCheckpoint !== null }
  );

  const workingTreeDiff = useReviewDiffPreview({
    environmentId: props.environmentId,
    cwd: props.cwd,
    enabled: props.live && mode === "working-tree",
  });

  const activeDiff = useMemo(() => {
    if (mode === "working-tree") {
      return workingTreeDiff.data?.sources[0]?.diff ?? null;
    }
    if (mode === "checkpoint") {
      return checkpointDiff.data?.diff ?? null;
    }
    return threadDiff.data?.diff ?? null;
  }, [
    checkpointDiff.data?.diff,
    mode,
    threadDiff.data?.diff,
    workingTreeDiff.data?.sources,
  ]);
  const activeError =
    mode === "working-tree"
      ? workingTreeDiff.error
      : mode === "checkpoint"
        ? checkpointDiff.error
        : threadDiff.error;
  const activePending =
    mode === "working-tree"
      ? workingTreeDiff.isPending
      : mode === "checkpoint"
        ? checkpointDiff.isPending
        : threadDiff.isPending;

  useEffect(() => {
    if (!props.live) return;
    workspaceLog("diff", "mode", {
      mode,
      pending: activePending,
      hasDiff: activeDiff !== null,
      error: activeError ?? null,
      checkpointTurn: selectedCheckpoint?.checkpointTurnCount ?? null,
    });
  }, [
    activeDiff,
    activeError,
    activePending,
    mode,
    props.live,
    selectedCheckpoint?.checkpointTurnCount,
  ]);

  if (!props.live) {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <AppIcon name="wifi" size={28} color={theme.muted} />
        <Text className="text-center text-base font-semibold text-foreground">
          Live connection required
        </Text>
        <Text className="text-center text-sm leading-6 text-muted">
          Diff loading needs an active WebSocket session to your T3 Code server.
        </Text>
      </View>
    );
  }

  if (!props.cwd) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center text-sm text-muted">
          This thread does not have a workspace path yet, so there is nothing to diff.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="max-h-12 flex-grow-0 border-b border-border"
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8, alignItems: "center" }}
      >
        <DiffModeChip label="Thread" active={mode === "thread"} onPress={() => setMode("thread")} />
        <DiffModeChip
          label="Working tree"
          active={mode === "working-tree"}
          onPress={() => setMode("working-tree")}
        />
        <DiffModeChip
          label="Checkpoint"
          active={mode === "checkpoint"}
          onPress={() => {
            setMode("checkpoint");
            setSelectedCheckpoint((current) => current ?? props.checkpoints.at(-1) ?? null);
          }}
        />
      </ScrollView>

      {mode === "checkpoint" ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="max-h-11 flex-grow-0 border-b border-border"
          contentContainerStyle={{ paddingHorizontal: 12, gap: 6, alignItems: "center" }}
        >
          {props.checkpoints.length === 0 ? (
            <Text className="px-2 text-xs text-muted">No checkpoints yet.</Text>
          ) : (
            props.checkpoints.map((checkpoint) => {
              const active = selectedCheckpoint?.turnId === checkpoint.turnId;
              return (
                <Pressable
                  key={checkpoint.turnId}
                  accessibilityRole="button"
                  onPress={() => setSelectedCheckpoint(checkpoint)}
                  className={`rounded-full px-3 py-1.5 ${active ? "bg-accent" : "bg-default"}`}
                >
                  <Text className={`text-xs font-semibold ${active ? "text-white" : "text-muted"}`}>
                    Turn {checkpoint.checkpointTurnCount}
                  </Text>
                </Pressable>
              );
            })
          )}
        </ScrollView>
      ) : null}

      {activePending ? (
        <View className="items-center py-6">
          <ActivityIndicator color="#f97316" />
        </View>
      ) : null}

      {activeError ? <Text className="px-4 py-2 text-xs text-red-400">{activeError}</Text> : null}

      <UnifiedDiffView
        diff={activeDiff}
        emptyMessage={
          mode === "thread" && latestTurnCount === null
            ? "No checkpoint diffs are available for this thread yet."
            : "No changes to show for this view."
        }
      />
    </View>
  );
});

function DiffModeChip(props: {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      className={`rounded-full px-3 py-2 ${props.active ? "bg-accent" : "bg-default"}`}
    >
      <Text className={`text-xs font-semibold ${props.active ? "text-white" : "text-muted"}`}>
        {props.label}
      </Text>
    </Pressable>
  );
}