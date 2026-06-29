import { memo, useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";

import { useChromeTheme } from "@/components/chrome/useChromeTheme";
import {
  countDiffLineChanges,
  parseUnifiedDiff,
  resolveDiffFilePath,
  type ParsedDiffFile,
  type ParsedDiffLine,
} from "./diffParser";

const INITIAL_LINES_PER_FILE = 120;
const LINE_BATCH_SIZE = 120;
const MAX_FILES = 80;

function lineColors(type: ParsedDiffLine["type"], theme: ReturnType<typeof useChromeTheme>) {
  switch (type) {
    case "add":
      return {
        backgroundColor: theme.isDark ? "rgba(34, 197, 94, 0.16)" : "rgba(34, 197, 94, 0.12)",
        color: theme.isDark ? "#bbf7d0" : "#166534",
      };
    case "delete":
      return {
        backgroundColor: theme.isDark ? "rgba(239, 68, 68, 0.16)" : "rgba(239, 68, 68, 0.12)",
        color: theme.isDark ? "#fecaca" : "#991b1b",
      };
    case "hunk":
      return {
        backgroundColor: theme.isDark ? "rgba(115, 115, 115, 0.18)" : "rgba(115, 115, 115, 0.1)",
        color: theme.muted,
      };
    case "meta":
      return { backgroundColor: "transparent", color: theme.muted };
    default:
      return { backgroundColor: "transparent", color: theme.foreground };
  }
}

const DiffLineRow = memo(function DiffLineRow(props: {
  readonly line: ParsedDiffLine;
  readonly theme: ReturnType<typeof useChromeTheme>;
}) {
  const style = lineColors(props.line.type, props.theme);
  const prefix =
    props.line.type === "add"
      ? "+"
      : props.line.type === "delete"
        ? "-"
        : props.line.type === "context"
          ? " "
          : "";

  return (
    <View style={{ backgroundColor: style.backgroundColor, flexDirection: "row" }}>
      <Text
        className="w-10 px-1 text-right font-mono text-[10px]"
        style={{ color: props.theme.muted }}
        selectable={false}
      >
        {props.line.oldLine ?? ""}
      </Text>
      <Text
        className="w-10 px-1 text-right font-mono text-[10px]"
        style={{ color: props.theme.muted }}
        selectable={false}
      >
        {props.line.newLine ?? ""}
      </Text>
      <Text
        className="flex-1 px-1 font-mono text-[11px] leading-5"
        style={{ color: style.color }}
        selectable
      >
        {prefix}
        {props.line.content}
      </Text>
    </View>
  );
});

const DiffFileSection = memo(function DiffFileSection(props: {
  readonly file: ParsedDiffFile;
  readonly theme: ReturnType<typeof useChromeTheme>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [visibleLines, setVisibleLines] = useState(INITIAL_LINES_PER_FILE);
  const filePath = resolveDiffFilePath(props.file);
  const canExpand = props.file.lines.length > visibleLines;
  const { additions, deletions } = countDiffLineChanges(props.file);

  const lines = expanded ? props.file.lines.slice(0, visibleLines) : [];

  return (
    <View className="border-b border-border">
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setExpanded((current) => !current);
          setVisibleLines(INITIAL_LINES_PER_FILE);
        }}
        className="bg-default px-3 py-2.5"
      >
        <Text className="font-mono text-xs font-semibold text-foreground" numberOfLines={2}>
          {expanded ? "▼" : "▶"} {filePath}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-2">
          {additions > 0 ? (
            <Text
              className="text-[11px] font-semibold"
              style={{ color: props.theme.isDark ? "#86efac" : "#166534" }}
            >
              +{additions}
            </Text>
          ) : null}
          {deletions > 0 ? (
            <Text
              className="text-[11px] font-semibold"
              style={{ color: props.theme.isDark ? "#fca5a5" : "#991b1b" }}
            >
              -{deletions}
            </Text>
          ) : null}
          {additions === 0 && deletions === 0 ? (
            <Text className="text-[11px] text-muted">No line changes</Text>
          ) : null}
        </View>
      </Pressable>
      {expanded
        ? lines.map((line) => <DiffLineRow key={line.id} line={line} theme={props.theme} />)
        : null}
      {expanded && canExpand ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setVisibleLines((current) => current + LINE_BATCH_SIZE)}
          className="items-center py-3"
        >
          <Text className="text-xs font-semibold text-accent">
            Show more ({props.file.lines.length - visibleLines} remaining)
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

export function UnifiedDiffView(props: {
  readonly diff: string | null | undefined;
  readonly emptyMessage?: string;
}) {
  const theme = useChromeTheme();
  const files = useMemo(() => {
    if (!props.diff || props.diff.trim().length === 0) {
      return [];
    }
    return parseUnifiedDiff(props.diff).slice(0, MAX_FILES);
  }, [props.diff]);

  const renderItem = useCallback(
    ({ item }: { readonly item: ParsedDiffFile }) => (
      <DiffFileSection file={item} theme={theme} />
    ),
    [theme]
  );

  if (files.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-8">
        <Text className="text-center text-sm text-muted">
          {props.emptyMessage ?? "No changes to show."}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      className="flex-1"
      data={files}
      keyExtractor={(file) => file.id}
      renderItem={renderItem}
      initialNumToRender={6}
      maxToRenderPerBatch={4}
      windowSize={7}
      removeClippedSubviews
      contentContainerStyle={{ paddingBottom: 24 }}
    />
  );
}