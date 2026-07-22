import Svg, { Path, Rect } from "react-native-svg";

export type FileIconKind =
  | "folder"
  | "file"
  | "typescript"
  | "javascript"
  | "react"
  | "json"
  | "markdown"
  | "css"
  | "html"
  | "image"
  | "config";

export function fileIconKindForName(name: string, kind: "file" | "directory"): FileIconKind {
  if (kind === "directory") {
    return "folder";
  }

  const lower = name.toLowerCase();
  if (lower.endsWith(".tsx") || lower.endsWith(".jsx")) return "react";
  if (lower.endsWith(".ts") || lower.endsWith(".mts") || lower.endsWith(".cts")) return "typescript";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "javascript";
  if (lower.endsWith(".json") || lower.endsWith(".jsonc")) return "json";
  if (lower.endsWith(".md") || lower.endsWith(".mdx")) return "markdown";
  if (lower.endsWith(".css") || lower.endsWith(".scss") || lower.endsWith(".sass")) return "css";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "html";
  if (/\.(png|jpe?g|gif|webp|svg|ico)$/i.test(lower)) return "image";
  if (
    lower.endsWith(".yaml") ||
    lower.endsWith(".yml") ||
    lower.endsWith(".toml") ||
    lower.endsWith(".env") ||
    lower === "dockerfile"
  ) {
    return "config";
  }
  return "file";
}

const ICON_COLORS: Record<FileIconKind, string> = {
  folder: "#2563eb",
  file: "#a3a3a3",
  typescript: "#3178c6",
  javascript: "#f7df1e",
  react: "#61dafb",
  json: "#f59e0b",
  markdown: "#38bdf8",
  css: "#2563eb",
  html: "#ea580c",
  image: "#a855f7",
  config: "#737373",
};

export function FileTypeIcon(props: {
  readonly kind: FileIconKind;
  readonly size?: number;
}) {
  const size = props.size ?? 18;
  const color = ICON_COLORS[props.kind];

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {props.kind === "folder" ? (
        <Path
          d="M3 6.5h6l2 2h10v9.5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      ) : props.kind === "react" ? (
        <>
          <Path
            d="M12 8.2c3.2 0 5.8.5 5.8 1.2s-2.6 1.2-5.8 1.2-5.8-.5-5.8-1.2 2.6-1.2 5.8-1.2Z"
            fill="none"
            stroke={color}
            strokeWidth={1.4}
          />
          <Path
            d="M7.4 10.4c1.6 2.8 4 4.8 5.8 4.5 1.8-.3 2.8-3.1 2.2-6.3"
            fill="none"
            stroke={color}
            strokeWidth={1.4}
          />
          <Path
            d="M16.6 10.4c-1.6 2.8-4 4.8-5.8 4.5-1.8-.3-2.8-3.1-2.2-6.3"
            fill="none"
            stroke={color}
            strokeWidth={1.4}
          />
          <Path d="M12 12.2a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Z" fill={color} />
        </>
      ) : props.kind === "typescript" ? (
        <Rect x="3" y="3" width="18" height="18" rx="3" fill={color} />
      ) : props.kind === "javascript" ? (
        <Rect x="3" y="3" width="18" height="18" rx="3" fill={color} />
      ) : props.kind === "json" ? (
        <Path
          d="M6 4h8l4 4v12H6Z"
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      ) : (
        <Path
          d="M6 3h8l4 4v14H6Z"
          fill="none"
          stroke={color}
          strokeWidth={1.8}
          strokeLinejoin="round"
        />
      )}
      {props.kind === "typescript" ? (
        <Path
          d="M8.5 16.5h2.1c.8 0 1.4-.2 1.8-.6.5-.4.7-1 .7-1.7 0-.6-.2-1.1-.6-1.4-.4-.4-1-.6-1.8-.6H8.5v4.3Zm0-5.4h1.9c.7 0 1.2-.2 1.5-.5.3-.3.5-.7.5-1.2 0-.5-.2-.9-.5-1.1-.3-.3-.8-.4-1.5-.4H8.5v3.2Z"
          fill="#ffffff"
        />
      ) : null}
      {props.kind === "javascript" ? (
        <Path
          d="M8.8 16.8c.5.4 1.1.6 1.8.6.7 0 1.2-.2 1.6-.5.4-.4.6-.8.6-1.4 0-.8-.4-1.3-1.3-1.7l-.8-.4c-.4-.2-.6-.4-.6-.6 0-.3.3-.5.7-.5.4 0 .8.1 1.1.4l.8-1c-.6-.5-1.3-.8-2.1-.8-1 0-1.7.5-1.7 1.4 0 .8.5 1.2 1.4 1.6l.7.3c.5.2.7.4.7.7 0 .3-.3.6-.8.6-.5 0-1-.2-1.4-.6l-.9 1Z"
          fill="#111111"
        />
      ) : null}
    </Svg>
  );
}