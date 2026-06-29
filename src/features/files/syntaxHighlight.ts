import type { SyntaxLanguage } from "./fileSyntaxLanguage";

export type SyntaxTokenKind =
  | "keyword"
  | "string"
  | "comment"
  | "number"
  | "plain"
  | "punctuation"
  | "type"
  | "property";

export interface SyntaxToken {
  readonly text: string;
  readonly kind: SyntaxTokenKind;
}

const KEYWORDS_BY_LANGUAGE: Partial<Record<SyntaxLanguage, ReadonlySet<string>>> = {
  typescript: new Set([
    "as",
    "async",
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "default",
    "delete",
    "do",
    "else",
    "enum",
    "export",
    "extends",
    "false",
    "finally",
    "for",
    "from",
    "function",
    "if",
    "import",
    "in",
    "interface",
    "let",
    "new",
    "null",
    "of",
    "return",
    "switch",
    "this",
    "throw",
    "true",
    "try",
    "type",
    "typeof",
    "undefined",
    "var",
    "void",
    "while",
    "yield",
  ]),
  javascript: new Set([
    "async",
    "await",
    "break",
    "case",
    "catch",
    "class",
    "const",
    "continue",
    "default",
    "delete",
    "do",
    "else",
    "export",
    "extends",
    "false",
    "finally",
    "for",
    "from",
    "function",
    "if",
    "import",
    "in",
    "let",
    "new",
    "null",
    "of",
    "return",
    "switch",
    "this",
    "throw",
    "true",
    "try",
    "typeof",
    "undefined",
    "var",
    "void",
    "while",
    "yield",
  ]),
  python: new Set([
    "and",
    "as",
    "async",
    "await",
    "break",
    "class",
    "continue",
    "def",
    "del",
    "elif",
    "else",
    "except",
    "False",
    "finally",
    "for",
    "from",
    "global",
    "if",
    "import",
    "in",
    "is",
    "lambda",
    "None",
    "nonlocal",
    "not",
    "or",
    "pass",
    "raise",
    "return",
    "True",
    "try",
    "while",
    "with",
    "yield",
  ]),
  rust: new Set([
    "as",
    "async",
    "await",
    "break",
    "const",
    "continue",
    "crate",
    "else",
    "enum",
    "extern",
    "false",
    "fn",
    "for",
    "if",
    "impl",
    "in",
    "let",
    "loop",
    "match",
    "mod",
    "move",
    "mut",
    "pub",
    "ref",
    "return",
    "self",
    "Self",
    "static",
    "struct",
    "super",
    "trait",
    "true",
    "type",
    "use",
    "where",
    "while",
  ]),
  go: new Set([
    "break",
    "case",
    "chan",
    "const",
    "continue",
    "default",
    "defer",
    "else",
    "fallthrough",
    "for",
    "func",
    "go",
    "goto",
    "if",
    "import",
    "interface",
    "map",
    "package",
    "range",
    "return",
    "select",
    "struct",
    "switch",
    "type",
    "var",
  ]),
  shell: new Set([
    "case",
    "do",
    "done",
    "elif",
    "else",
    "esac",
    "export",
    "fi",
    "for",
    "function",
    "if",
    "in",
    "local",
    "return",
    "then",
    "while",
  ]),
};

function pushPlain(tokens: SyntaxToken[], text: string): void {
  if (text.length === 0) return;
  const last = tokens.at(-1);
  if (last?.kind === "plain") {
    tokens[tokens.length - 1] = { text: `${last.text}${text}`, kind: "plain" };
    return;
  }
  tokens.push({ text, kind: "plain" });
}

function tokenizeCodeLine(line: string, language: SyntaxLanguage): readonly SyntaxToken[] {
  const keywords = KEYWORDS_BY_LANGUAGE[language];
  const tokens: SyntaxToken[] = [];
  let index = 0;

  while (index < line.length) {
    const rest = line.slice(index);

    const commentMatch = /^(\/\/.*|#.*)/.exec(rest);
    if (commentMatch) {
      tokens.push({ text: commentMatch[1] ?? "", kind: "comment" });
      break;
    }

    const stringMatch = /^("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/.exec(rest);
    if (stringMatch) {
      tokens.push({ text: stringMatch[1] ?? "", kind: "string" });
      index += stringMatch[1]?.length ?? 0;
      continue;
    }

    const numberMatch = /^(\b\d+(?:\.\d+)?\b)/.exec(rest);
    if (numberMatch) {
      tokens.push({ text: numberMatch[1] ?? "", kind: "number" });
      index += numberMatch[1]?.length ?? 0;
      continue;
    }

    const wordMatch = /^([A-Za-z_$][\w$]*)/.exec(rest);
    if (wordMatch) {
      const word = wordMatch[1] ?? "";
      if (keywords?.has(word)) {
        tokens.push({ text: word, kind: "keyword" });
      } else if (/^[A-Z]/.test(word)) {
        tokens.push({ text: word, kind: "type" });
      } else {
        pushPlain(tokens, word);
      }
      index += word.length;
      continue;
    }

    const punctuationMatch = /^([{}[\]();,.:=<>!&|+\-*/%@]+)/.exec(rest);
    if (punctuationMatch) {
      tokens.push({ text: punctuationMatch[1] ?? "", kind: "punctuation" });
      index += punctuationMatch[1]?.length ?? 0;
      continue;
    }

    pushPlain(tokens, rest[0] ?? "");
    index += 1;
  }

  return tokens;
}

function tokenizeJsonLine(line: string): readonly SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  const propertyMatch = /^(\s*)"([^"\\]|\\.)*"(?=\s*:)/.exec(line);
  if (propertyMatch) {
    tokens.push({ text: propertyMatch[1] ?? "", kind: "plain" });
    tokens.push({ text: propertyMatch[0].slice(propertyMatch[1]?.length ?? 0), kind: "property" });
    const remainder = line.slice(propertyMatch[0].length);
    return [...tokens, ...tokenizeCodeLine(remainder, "javascript")];
  }

  return tokenizeCodeLine(line, "javascript");
}

function tokenizeMarkdownLine(line: string): readonly SyntaxToken[] {
  const headingMatch = /^(#{1,6}\s+)(.*)$/.exec(line);
  if (headingMatch) {
    return [
      { text: headingMatch[1] ?? "", kind: "keyword" },
      { text: headingMatch[2] ?? "", kind: "plain" },
    ];
  }

  const fenceMatch = /^(`{3,}.*)$/.exec(line);
  if (fenceMatch) {
    return [{ text: fenceMatch[1] ?? "", kind: "punctuation" }];
  }

  return tokenizeCodeLine(line, "plain");
}

function tokenizeCssLine(line: string): readonly SyntaxToken[] {
  const selectorMatch = /^([^{]+)(\{?)/.exec(line);
  if (selectorMatch && !line.trimStart().startsWith("/*")) {
    const tokens: SyntaxToken[] = [{ text: selectorMatch[1] ?? "", kind: "type" }];
    if (selectorMatch[2]) tokens.push({ text: selectorMatch[2], kind: "punctuation" });
    return [...tokens, ...tokenizeCodeLine(line.slice(selectorMatch[0].length), "css")];
  }

  return tokenizeCodeLine(line, "css");
}

function tokenizeHtmlLine(line: string): readonly SyntaxToken[] {
  const tokens: SyntaxToken[] = [];
  let index = 0;

  while (index < line.length) {
    const rest = line.slice(index);
    const tagMatch = /^<\/?[A-Za-z][^>]*>/.exec(rest);
    if (tagMatch) {
      tokens.push({ text: tagMatch[0], kind: "keyword" });
      index += tagMatch[0].length;
      continue;
    }

    const stringMatch = /^("[^"]*"|'[^']*')/.exec(rest);
    if (stringMatch) {
      tokens.push({ text: stringMatch[1] ?? "", kind: "string" });
      index += stringMatch[1]?.length ?? 0;
      continue;
    }

    pushPlain(tokens, rest[0] ?? "");
    index += 1;
  }

  return tokens;
}

function tokenizeYamlLine(line: string): readonly SyntaxToken[] {
  const keyMatch = /^(\s*[^:#\s][^:]*)(:)(.*)$/.exec(line);
  if (keyMatch) {
    return [
      { text: keyMatch[1] ?? "", kind: "property" },
      { text: keyMatch[2] ?? "", kind: "punctuation" },
      ...tokenizeCodeLine(keyMatch[3] ?? "", "plain"),
    ];
  }

  return tokenizeCodeLine(line, "plain");
}

function tokenizeLine(line: string, language: SyntaxLanguage): readonly SyntaxToken[] {
  switch (language) {
    case "json":
      return tokenizeJsonLine(line);
    case "markdown":
      return tokenizeMarkdownLine(line);
    case "css":
      return tokenizeCssLine(line);
    case "html":
      return tokenizeHtmlLine(line);
    case "yaml":
      return tokenizeYamlLine(line);
    case "plain":
      return [{ text: line, kind: "plain" }];
    default:
      return tokenizeCodeLine(line, language);
  }
}

export function highlightSource(
  source: string,
  language: SyntaxLanguage
): ReadonlyArray<readonly SyntaxToken[]> {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  return lines.map((line) => tokenizeLine(line, language));
}