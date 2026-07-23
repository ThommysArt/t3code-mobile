import { Text, View } from "react-native";

type BadgeStyle = {
  readonly label: string;
  readonly backgroundColor: string;
  readonly color: string;
};

function badgeForFileName(fileName: string): BadgeStyle {
  const lower = fileName.toLowerCase();
  const ext = lower.includes(".") ? (lower.split(".").pop() ?? "") : lower;

  if (ext === "tsx" || ext === "ts" || ext === "mts" || ext === "cts") {
    return { label: "TS", backgroundColor: "rgba(59, 130, 246, 0.22)", color: "#60a5fa" };
  }
  if (ext === "jsx" || ext === "js" || ext === "mjs" || ext === "cjs") {
    return { label: "JS", backgroundColor: "rgba(234, 179, 8, 0.22)", color: "#facc15" };
  }
  if (ext === "json" || ext === "jsonc") {
    return { label: "{}", backgroundColor: "rgba(251, 146, 60, 0.22)", color: "#fb923c" };
  }
  if (ext === "md" || ext === "mdx") {
    return { label: "M", backgroundColor: "rgba(56, 189, 248, 0.2)", color: "#38bdf8" };
  }
  if (ext === "yml" || ext === "yaml") {
    return { label: "Y", backgroundColor: "rgba(248, 113, 113, 0.2)", color: "#f87171" };
  }
  if (ext === "css" || ext === "scss" || ext === "sass") {
    return { label: "CSS", backgroundColor: "rgba(167, 139, 250, 0.22)", color: "#a78bfa" };
  }
  if (ext === "html" || ext === "htm") {
    return { label: "HTML", backgroundColor: "rgba(251, 113, 133, 0.22)", color: "#fb7185" };
  }
  if (ext === "py") {
    return { label: "PY", backgroundColor: "rgba(52, 211, 153, 0.2)", color: "#34d399" };
  }
  if (ext === "rs") {
    return { label: "RS", backgroundColor: "rgba(251, 146, 60, 0.22)", color: "#fb923c" };
  }
  if (ext === "go") {
    return { label: "GO", backgroundColor: "rgba(56, 189, 248, 0.2)", color: "#38bdf8" };
  }
  if (ext === "sh" || ext === "bash" || ext === "zsh") {
    return { label: "SH", backgroundColor: "rgba(163, 230, 53, 0.2)", color: "#a3e635" };
  }
  if (lower.includes("lock") || lower.endsWith(".lock")) {
    return { label: "LK", backgroundColor: "rgba(250, 204, 21, 0.2)", color: "#facc15" };
  }
  if (ext === "toml" || ext === "ini" || ext === "env") {
    return { label: "CFG", backgroundColor: "rgba(148, 163, 184, 0.22)", color: "#94a3b8" };
  }
  if (ext === "svg" || ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "webp") {
    return { label: "IMG", backgroundColor: "rgba(244, 114, 182, 0.2)", color: "#f472b6" };
  }

  const label = (ext || "?").slice(0, 3).toUpperCase();
  return { label, backgroundColor: "rgba(115, 115, 115, 0.22)", color: "#a3a3a3" };
}

export function FileTypeBadge({ fileName }: { readonly fileName: string }) {
  const badge = badgeForFileName(fileName);
  return (
    <View
      className="h-3.5 min-w-3.5 items-center justify-center rounded-[3px] px-0.5"
      style={{ backgroundColor: badge.backgroundColor }}
    >
      <Text
        className="font-mono text-[8px] font-bold leading-none"
        style={{ color: badge.color }}
        numberOfLines={1}
      >
        {badge.label}
      </Text>
    </View>
  );
}
