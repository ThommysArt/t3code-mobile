import * as Clipboard from "expo-clipboard";
import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  useColorScheme,
  View,
  type TextStyle,
} from "react-native";
import Markdown, { type ASTNode, type RenderRules } from "react-native-markdown-display";

import { AppIcon } from "@/components/AppIcon";
import { type SyntaxLanguage } from "@/features/files/fileSyntaxLanguage";
import { highlightSource, type SyntaxToken, type SyntaxTokenKind } from "@/features/files/syntaxHighlight";
import { GEIST_MONO } from "@/theme/fonts";

type FenceNode = ASTNode & {
  readonly sourceInfo?: string;
};

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
      return isDark ? "#fbbf24" : "#b45309";
    case "punctuation":
      return isDark ? "#a3a3a3" : "#525252";
    default:
      return isDark ? "#e5e5e5" : "#e5e5e5";
  }
}

function parseFenceMeta(sourceInfo: string | undefined): {
  language: string;
  title: string | null;
} {
  const raw = (sourceInfo ?? "").trim();
  if (!raw) return { language: "text", title: null };

  const titleMatch = /\btitle=(?:"([^"]+)"|'([^']+)'|(\S+))/i.exec(raw);
  const title = titleMatch?.[1] ?? titleMatch?.[2] ?? titleMatch?.[3] ?? null;

  const languageToken = raw.split(/\s+/)[0]?.replace(/^language-/, "") ?? "text";
  // Drop title=... if it was the only token somehow.
  const language = languageToken.startsWith("title=") ? "text" : languageToken || "text";
  return { language, title };
}

function syntaxLanguageFromFence(language: string): SyntaxLanguage {
  const normalized = language.toLowerCase();
  switch (normalized) {
    case "ts":
    case "tsx":
    case "typescript":
    case "mts":
    case "cts":
      return "typescript";
    case "js":
    case "jsx":
    case "javascript":
    case "mjs":
    case "cjs":
      return "javascript";
    case "json":
    case "jsonc":
      return "json";
    case "md":
    case "mdx":
    case "markdown":
      return "markdown";
    case "css":
    case "scss":
    case "sass":
      return "css";
    case "html":
    case "htm":
    case "xml":
      return "html";
    case "sh":
    case "bash":
    case "zsh":
    case "shell":
    case "console":
    case "terminal":
    case "cmd":
    case "powershell":
    case "ps1":
      return "shell";
    case "py":
    case "python":
      return "python";
    case "rs":
    case "rust":
      return "rust";
    case "go":
    case "golang":
      return "go";
    case "yml":
    case "yaml":
    case "toml":
      return "yaml";
    default:
      return "plain";
  }
}

function isShellLanguage(language: string): boolean {
  return syntaxLanguageFromFence(language) === "shell";
}

function HighlightedCodeBody({
  code,
  language,
  wrapped,
  isDark,
}: {
  readonly code: string;
  readonly language: SyntaxLanguage;
  readonly wrapped: boolean;
  readonly isDark: boolean;
}) {
  const lines = useMemo(() => highlightSource(code, language), [code, language]);

  const content = (
    <View style={{ paddingHorizontal: 12, paddingVertical: 10, minWidth: "100%" as const }}>
      {lines.map((tokens, lineIndex) => (
        <Text
          key={`line-${lineIndex}`}
          selectable
          style={{
            color: tokenColor("plain", isDark),
            fontFamily: GEIST_MONO,
            fontSize: 12.5,
            lineHeight: 19,
            ...(wrapped ? undefined : { flexShrink: 0 }),
          }}
        >
          {tokens.length === 0
            ? " "
            : tokens.map((token: SyntaxToken, tokenIndex) => (
                <Text
                  key={`${lineIndex}:${tokenIndex}`}
                  style={{ color: tokenColor(token.kind, isDark), fontFamily: GEIST_MONO }}
                >
                  {token.text}
                </Text>
              ))}
        </Text>
      ))}
    </View>
  );

  if (wrapped) {
    return content;
  }

  return (
    <ScrollView
      horizontal
      bounces={false}
      showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }}
    >
      {content}
    </ScrollView>
  );
}

function CodeBlockCard({
  code,
  languageLabel,
  title,
}: {
  readonly code: string;
  readonly languageLabel: string;
  readonly title: string | null;
}) {
  const isDark = useColorScheme() === "dark";
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const syntaxLanguage = syntaxLanguageFromFence(languageLabel);
  const shell = isShellLanguage(languageLabel);

  const border = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)";
  const cardBg = isDark ? "#0c0c0c" : "#18181b";
  const headerBg = isDark ? "#141414" : "#1f1f23";
  const headerBorder = isDark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.08)";
  const muted = isDark ? "#858585" : "#a3a3a3";
  const iconColor = muted;

  const displayTitle = title ?? (shell ? null : languageLabel !== "text" ? languageLabel : null);

  const handleCopy = () => {
    void Clipboard.setStringAsync(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <View
      style={{
        backgroundColor: cardBg,
        borderColor: border,
        borderRadius: 12,
        borderWidth: 1,
        marginVertical: 8,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          alignItems: "center",
          backgroundColor: headerBg,
          borderBottomColor: headerBorder,
          borderBottomWidth: 1,
          flexDirection: "row",
          gap: 8,
          justifyContent: "space-between",
          minHeight: 34,
          paddingLeft: 10,
          paddingRight: 4,
          paddingVertical: 4,
        }}
      >
        <View style={{ alignItems: "center", flex: 1, flexDirection: "row", gap: 6, minWidth: 0 }}>
          <AppIcon
            name={shell ? "terminal" : "file"}
            size={13}
            color={shell ? "#86efac" : muted}
            strokeWidth={2}
          />
          {displayTitle ? (
            <Text
              numberOfLines={1}
              style={{
                color: muted,
                flexShrink: 1,
                fontFamily: GEIST_MONO,
                fontSize: 11,
              }}
            >
              {displayTitle}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: "center", flexDirection: "row", gap: 0 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={wrapped ? "Disable line wrap" : "Wrap lines"}
            accessibilityState={{ selected: wrapped }}
            hitSlop={6}
            onPress={() => setWrapped((current) => !current)}
            style={{
              alignItems: "center",
              backgroundColor: wrapped ? "rgba(255,255,255,0.08)" : "transparent",
              borderRadius: 8,
              height: 28,
              justifyContent: "center",
              minWidth: 28,
              paddingHorizontal: 6,
            }}
          >
            <Text
              style={{
                color: wrapped ? "#e5e5e5" : muted,
                fontFamily: GEIST_MONO,
                fontSize: 10,
                fontWeight: "600",
              }}
            >
              wrap
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copied ? "Copied" : "Copy code"}
            hitSlop={6}
            onPress={handleCopy}
            style={{
              alignItems: "center",
              borderRadius: 8,
              height: 28,
              justifyContent: "center",
              width: 28,
            }}
          >
            <AppIcon
              name={copied ? "check" : "copy"}
              size={13}
              color={copied ? "#86efac" : iconColor}
              strokeWidth={2.2}
            />
          </Pressable>
        </View>
      </View>
      <HighlightedCodeBody
        code={code}
        language={syntaxLanguage}
        wrapped={wrapped}
        isDark
      />
    </View>
  );
}

function trimTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value.slice(0, -1) : value;
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
  const border = isDark ? "#303030" : "#dedee2";
  const link = isDark ? "#60a5fa" : "#2563eb";

  const rules = useMemo<RenderRules>(
    () => ({
      code_block: (node) => {
        const code = trimTrailingNewline(node.content);
        return (
          <CodeBlockCard
            key={node.key}
            code={code}
            languageLabel="text"
            title={null}
          />
        );
      },
      fence: (node) => {
        const fenceNode = node as FenceNode;
        const code = trimTrailingNewline(fenceNode.content);
        const meta = parseFenceMeta(fenceNode.sourceInfo);
        return (
          <CodeBlockCard
            key={fenceNode.key}
            code={code}
            languageLabel={meta.language}
            title={meta.title}
          />
        );
      },
    }),
    []
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
        borderRadius: 6,
        borderWidth: 1,
        color: foreground,
        fontFamily: GEIST_MONO,
        fontSize: compact ? 12 : 13,
        paddingHorizontal: 5,
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
