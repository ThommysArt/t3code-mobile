import type { OrchestrationCheckpointFile } from "@t3tools/contracts";
import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, Text, useColorScheme, View } from "react-native";

import { AppIcon } from "@/components/AppIcon";
import { FileTypeBadge } from "./FileTypeBadge";
import {
  buildTurnDiffTree,
  formatCompactDiffCount,
  hasNonZeroStat,
  summarizeTurnDiffStats,
  type TurnDiffStat,
  type TurnDiffTreeNode,
} from "./turnDiffTree";

const EMPTY_DIRECTORY_OVERRIDES: Record<string, boolean> = {};

function DiffStatText({
  stat,
  size = "sm",
}: {
  readonly stat: TurnDiffStat;
  readonly size?: "sm" | "xs";
}) {
  const textClass = size === "xs" ? "text-[10px]" : "text-[11px]";
  return (
    <View className="flex-row items-center gap-1.5">
      <Text
        className={`font-mono font-semibold tabular-nums ${textClass} ${
          stat.additions > 0 ? "text-success" : "text-muted/40"
        }`}
      >
        +{formatCompactDiffCount(stat.additions)}
      </Text>
      <Text
        className={`font-mono font-semibold tabular-nums ${textClass} ${
          stat.deletions > 0 ? "text-danger" : "text-muted/40"
        }`}
      >
        -{formatCompactDiffCount(stat.deletions)}
      </Text>
    </View>
  );
}

const TreeNodeRow = memo(function TreeNodeRow(props: {
  readonly node: TurnDiffTreeNode;
  readonly depth: number;
  readonly expandedDirectories: Readonly<Record<string, boolean>>;
  readonly defaultExpanded: boolean;
  readonly hasDirectoryNodes: boolean;
  readonly onToggleDirectory: (path: string) => void;
}) {
  const isDark = useColorScheme() === "dark";
  const mutedIcon = isDark ? "#737373" : "#a3a3a3";
  const leftPadding = 8 + props.depth * 12;

  if (props.node.kind === "directory") {
    const isExpanded = props.expandedDirectories[props.node.path] ?? props.defaultExpanded;
    return (
      <View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          hitSlop={4}
          onPress={() => props.onToggleDirectory(props.node.path)}
          className="flex-row items-center gap-1.5 rounded-xl py-1 pr-2 active:bg-default/60"
          style={{ paddingLeft: leftPadding }}
        >
          <AppIcon
            name={isExpanded ? "chevron-down" : "chevron-right"}
            size={12}
            color={mutedIcon}
            strokeWidth={2.2}
          />
          <AppIcon name="folder" size={13} color={mutedIcon} strokeWidth={2} />
          <Text className="min-w-0 flex-1 font-mono text-[11px] text-muted" numberOfLines={1}>
            {props.node.name}
          </Text>
          {hasNonZeroStat(props.node.stat) ? (
            <DiffStatText stat={props.node.stat} size="xs" />
          ) : null}
        </Pressable>
        {isExpanded
          ? props.node.children.map((child) => (
              <TreeNodeRow
                key={`${child.kind}:${child.path}`}
                node={child}
                depth={props.depth + 1}
                expandedDirectories={props.expandedDirectories}
                defaultExpanded={props.defaultExpanded}
                hasDirectoryNodes={props.hasDirectoryNodes}
                onToggleDirectory={props.onToggleDirectory}
              />
            ))
          : null}
      </View>
    );
  }

  return (
    <View
      className="flex-row items-center gap-1.5 rounded-xl py-1 pr-2"
      style={{ paddingLeft: leftPadding }}
    >
      {props.hasDirectoryNodes || props.depth > 0 ? <View className="h-3 w-3" /> : null}
      <FileTypeBadge fileName={props.node.name} />
      <Text className="min-w-0 flex-1 font-mono text-[11px] text-muted" numberOfLines={1}>
        {props.node.name}
      </Text>
      {props.node.stat ? <DiffStatText stat={props.node.stat} size="xs" /> : null}
    </View>
  );
});

function collectDirectoryPaths(nodes: ReadonlyArray<TurnDiffTreeNode>): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.kind !== "directory") continue;
    paths.push(node.path);
    paths.push(...collectDirectoryPaths(node.children));
  }
  return paths;
}

export function ChangedFilesCard({
  files,
  initiallyExpanded = true,
}: {
  readonly files: ReadonlyArray<OrchestrationCheckpointFile>;
  readonly initiallyExpanded?: boolean;
}) {
  const isDark = useColorScheme() === "dark";
  const iconColor = isDark ? "#858585" : "#737373";
  const cardBorder = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  const cardBg = isDark ? "rgba(23,23,23,0.72)" : "rgba(250,250,250,0.92)";
  const headerBg = isDark ? "rgba(23,23,23,0.9)" : "rgba(250,250,250,0.98)";

  const [cardExpanded, setCardExpanded] = useState(initiallyExpanded);
  const [allDirectoriesExpanded, setAllDirectoriesExpanded] = useState(true);
  const [directoryExpansionState, setDirectoryExpansionState] = useState<{
    key: string;
    overrides: Record<string, boolean>;
  }>({ key: "", overrides: {} });

  const treeNodes = useMemo(() => buildTurnDiffTree(files), [files]);
  const summary = useMemo(() => summarizeTurnDiffStats(files), [files]);
  const directoryPathsKey = useMemo(
    () => collectDirectoryPaths(treeNodes).join("\u0000"),
    [treeNodes]
  );
  const hasDirectoryNodes = directoryPathsKey.length > 0;
  const expansionStateKey = `${allDirectoriesExpanded ? "expanded" : "collapsed"}\u0000${directoryPathsKey}`;
  const expandedDirectories =
    directoryExpansionState.key === expansionStateKey
      ? directoryExpansionState.overrides
      : EMPTY_DIRECTORY_OVERRIDES;

  const onToggleDirectory = useCallback(
    (path: string) => {
      setDirectoryExpansionState((current) => {
        const nextOverrides = current.key === expansionStateKey ? current.overrides : {};
        return {
          key: expansionStateKey,
          overrides: {
            ...nextOverrides,
            [path]: !(nextOverrides[path] ?? allDirectoriesExpanded),
          },
        };
      });
    },
    [allDirectoriesExpanded, expansionStateKey]
  );

  if (files.length === 0) return null;

  const fileLabel = files.length === 1 ? "1 changed file" : `${files.length} changed files`;

  return (
    <View
      className="mt-3 overflow-hidden rounded-2xl"
      style={{
        backgroundColor: cardBg,
        borderColor: cardBorder,
        borderWidth: 1,
      }}
    >
      <View
        className="flex-row items-center justify-between gap-2 px-3 py-2.5"
        style={{ backgroundColor: headerBg }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: cardExpanded }}
          hitSlop={6}
          onPress={() => setCardExpanded((current) => !current)}
          className="min-w-0 flex-1 flex-row flex-wrap items-center gap-1.5"
        >
          <Text className="text-xs font-semibold text-foreground">{fileLabel}</Text>
          {hasNonZeroStat(summary) ? <DiffStatText stat={summary} /> : null}
        </Pressable>
        <View className="flex-row items-center gap-0.5">
          {cardExpanded && hasDirectoryNodes ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                allDirectoriesExpanded ? "Collapse all folders" : "Expand all folders"
              }
              hitSlop={8}
              onPress={() => {
                setAllDirectoriesExpanded((current) => !current);
                setDirectoryExpansionState({ key: "", overrides: {} });
              }}
              className="h-7 w-7 items-center justify-center rounded-lg active:bg-default"
            >
              <AppIcon
                name={allDirectoriesExpanded ? "chevron-down" : "chevron-right"}
                size={14}
                color={iconColor}
                strokeWidth={2.2}
              />
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={cardExpanded ? "Collapse changed files" : "Expand changed files"}
            hitSlop={8}
            onPress={() => setCardExpanded((current) => !current)}
            className="h-7 w-7 items-center justify-center rounded-lg active:bg-default"
          >
            <AppIcon
              name={cardExpanded ? "x" : "chevron-down"}
              size={14}
              color={iconColor}
              strokeWidth={2.2}
            />
          </Pressable>
        </View>
      </View>

      {cardExpanded ? (
        <View className="px-1.5 pb-2 pt-0.5">
          {treeNodes.map((node) => (
            <TreeNodeRow
              key={`${node.kind}:${node.path}`}
              node={node}
              depth={0}
              expandedDirectories={expandedDirectories}
              defaultExpanded={allDirectoriesExpanded}
              hasDirectoryNodes={hasDirectoryNodes}
              onToggleDirectory={onToggleDirectory}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
