export type SyntaxLanguage =
  | "typescript"
  | "javascript"
  | "json"
  | "markdown"
  | "css"
  | "html"
  | "shell"
  | "python"
  | "rust"
  | "go"
  | "yaml"
  | "plain";

export function syntaxLanguageForFileName(name: string): SyntaxLanguage {
  const lower = name.toLowerCase();

  if (lower.endsWith(".tsx") || lower.endsWith(".ts") || lower.endsWith(".mts") || lower.endsWith(".cts")) {
    return "typescript";
  }
  if (lower.endsWith(".jsx") || lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) {
    return "javascript";
  }
  if (lower.endsWith(".json") || lower.endsWith(".jsonc")) {
    return "json";
  }
  if (lower.endsWith(".md") || lower.endsWith(".mdx")) {
    return "markdown";
  }
  if (lower.endsWith(".css") || lower.endsWith(".scss") || lower.endsWith(".sass")) {
    return "css";
  }
  if (lower.endsWith(".html") || lower.endsWith(".htm")) {
    return "html";
  }
  if (
    lower.endsWith(".sh") ||
    lower.endsWith(".bash") ||
    lower.endsWith(".zsh") ||
    lower === "dockerfile" ||
    lower.endsWith(".dockerfile")
  ) {
    return "shell";
  }
  if (lower.endsWith(".py") || lower.endsWith(".pyi")) {
    return "python";
  }
  if (lower.endsWith(".rs")) {
    return "rust";
  }
  if (lower.endsWith(".go")) {
    return "go";
  }
  if (lower.endsWith(".yaml") || lower.endsWith(".yml") || lower.endsWith(".toml")) {
    return "yaml";
  }

  return "plain";
}