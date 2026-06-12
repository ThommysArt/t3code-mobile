import { useMemo } from "react";
import { ScrollView, Text, useColorScheme, View, type TextStyle } from "react-native";
import Markdown, { type ASTNode, type RenderRules } from "react-native-markdown-display";

function CodeBlock({
  node,
  backgroundColor,
  textColor,
}: {
  readonly node: ASTNode;
  readonly backgroundColor: string;
  readonly textColor: string;
}) {
  return (
    <View
      style={{
        backgroundColor,
        borderRadius: 12,
        marginVertical: 6,
        overflow: "hidden",
      }}
    >
      <ScrollView
        horizontal
        bounces={false}
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 10 }}
      >
        <Text
          selectable
          style={{
            color: textColor,
            fontFamily: "monospace",
            fontSize: 13,
            lineHeight: 20,
          }}
        >
          {node.content.trimEnd()}
        </Text>
      </ScrollView>
    </View>
  );
}

export function MarkdownContent({
  compact = false,
  text,
}: {
  readonly compact?: boolean;
  readonly text: string;
}) {
  const isDark = useColorScheme() === "dark";
  const foreground = isDark ? "#f5f5f5" : "#171717";
  const muted = isDark ? "#a3a3a3" : "#525252";
  const codeBackground = isDark ? "#111111" : "#e4e4e7";
  const fenceBackground = isDark ? "#0a0a0a" : "#18181b";
  const fenceText = "#e5e5e5";
  const border = isDark ? "#303030" : "#dedee2";
  const link = isDark ? "#60a5fa" : "#2563eb";

  const rules = useMemo<RenderRules>(
    () => ({
      code_block: (node) => (
        <CodeBlock
          key={node.key}
          node={node}
          backgroundColor={fenceBackground}
          textColor={fenceText}
        />
      ),
      fence: (node) => (
        <CodeBlock
          key={node.key}
          node={node}
          backgroundColor={fenceBackground}
          textColor={fenceText}
        />
      ),
    }),
    [fenceBackground]
  );

  const styles = useMemo(() => {
    const body: TextStyle = {
      color: compact ? muted : foreground,
      fontSize: compact ? 13 : 15,
      lineHeight: compact ? 19 : 23,
    };
    return {
      body,
      text: body,
      paragraph: {
        marginTop: 0,
        marginBottom: compact ? 4 : 8,
      },
      heading1: {
        color: foreground,
        fontSize: compact ? 17 : 22,
        fontWeight: "700" as const,
        marginBottom: 7,
        marginTop: 8,
      },
      heading2: {
        color: foreground,
        fontSize: compact ? 16 : 19,
        fontWeight: "700" as const,
        marginBottom: 6,
        marginTop: 8,
      },
      heading3: {
        color: foreground,
        fontSize: compact ? 15 : 17,
        fontWeight: "700" as const,
        marginBottom: 5,
        marginTop: 6,
      },
      heading4: { color: foreground, fontSize: 15, fontWeight: "700" as const },
      heading5: { color: foreground, fontSize: 14, fontWeight: "700" as const },
      heading6: { color: foreground, fontSize: 13, fontWeight: "700" as const },
      strong: { color: foreground, fontWeight: "700" as const },
      em: { fontStyle: "italic" as const },
      link: { color: link, textDecorationLine: "underline" as const },
      blockquote: {
        backgroundColor: isDark ? "#171717" : "#f1f1f3",
        borderColor: border,
        borderLeftWidth: 3,
        marginLeft: 0,
        paddingHorizontal: 10,
        paddingVertical: 4,
      },
      bullet_list: { marginVertical: 3 },
      ordered_list: { marginVertical: 3 },
      list_item: { marginBottom: 3 },
      bullet_list_icon: { color: foreground, marginLeft: 4, marginRight: 8 },
      ordered_list_icon: { color: foreground, marginLeft: 4, marginRight: 8 },
      code_inline: {
        backgroundColor: codeBackground,
        borderColor: border,
        borderRadius: 5,
        borderWidth: 1,
        color: foreground,
        fontFamily: "monospace",
        fontSize: compact ? 12 : 13,
        paddingHorizontal: 4,
        paddingVertical: 1,
      },
      hr: { backgroundColor: border, height: 1, marginVertical: 10 },
    };
  }, [border, codeBackground, compact, foreground, isDark, link, muted]);

  return (
    <Markdown rules={rules} style={styles}>
      {text}
    </Markdown>
  );
}
