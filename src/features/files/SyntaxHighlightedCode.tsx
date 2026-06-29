import { memo, useMemo } from "react";
import { FlatList, Text, View } from "react-native";

import { useChromeTheme } from "@/components/chrome/useChromeTheme";
import { syntaxLanguageForFileName, type SyntaxLanguage } from "./fileSyntaxLanguage";
import { highlightSource, type SyntaxTokenKind } from "./syntaxHighlight";

function tokenColor(kind: SyntaxTokenKind, isDark: boolean): string {
  switch (kind) {
    case "keyword":
      return isDark ? "#c084fc" : "#7c3aed";
    case "string":
      return isDark ? "#86efac" : "#15803d";
    case "comment":
      return isDark ? "#737373" : "#6b7280";
    case "number":
      return isDark ? "#fdba74" : "#c2410c";
    case "type":
      return isDark ? "#67e8f9" : "#0e7490";
    case "property":
      return isDark ? "#93c5fd" : "#1d4ed8";
    case "punctuation":
      return isDark ? "#a3a3a3" : "#525252";
    default:
      return isDark ? "#f5f5f5" : "#171717";
  }
}

const HighlightedLine = memo(function HighlightedLine(props: {
  readonly lineNumber: number;
  readonly tokens: ReadonlyArray<{ readonly text: string; readonly kind: SyntaxTokenKind }>;
  readonly isDark: boolean;
}) {
  return (
    <View style={{ flexDirection: "row" }}>
      <Text
        selectable={false}
        style={{
          color: props.isDark ? "#525252" : "#a3a3a3",
          fontFamily: "Menlo",
          fontSize: 11,
          lineHeight: 18,
          minWidth: 28,
          paddingRight: 8,
          textAlign: "right",
        }}
      >
        {props.lineNumber}
      </Text>
      <Text
        selectable
        style={{
          flex: 1,
          fontFamily: "Menlo",
          fontSize: 11,
          lineHeight: 18,
        }}
      >
        {props.tokens.map((token, index) => (
          <Text key={`${props.lineNumber}:${index}`} style={{ color: tokenColor(token.kind, props.isDark) }}>
            {token.text}
          </Text>
        ))}
      </Text>
    </View>
  );
});

export const SyntaxHighlightedCode = memo(function SyntaxHighlightedCode(props: {
  readonly fileName: string;
  readonly source: string;
  readonly language?: SyntaxLanguage;
}) {
  const theme = useChromeTheme();
  const language = props.language ?? syntaxLanguageForFileName(props.fileName);
  const lines = useMemo(
    () => highlightSource(props.source, language),
    [language, props.source]
  );

  return (
    <FlatList
      data={lines}
      keyExtractor={(_, index) => `line-${index + 1}`}
      renderItem={({ item, index }) => (
        <HighlightedLine lineNumber={index + 1} tokens={item} isDark={theme.isDark} />
      )}
      initialNumToRender={24}
      maxToRenderPerBatch={24}
      windowSize={8}
      removeClippedSubviews
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 8 }}
    />
  );
});