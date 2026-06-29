import { memo, useMemo } from "react";
import { Text, View, type TextStyle } from "react-native";

import { applyTerminalDisplayBuffer } from "./terminalDisplayBuffer";
import type { TerminalTheme } from "./terminalTheme";

interface AnsiSpan {
  readonly text: string;
  readonly color?: string;
  readonly bold?: boolean;
  readonly dim?: boolean;
}

const CSI_SEQUENCE = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const SGR_SEQUENCE = /\u001b\[([0-9;]*)m/g;
const BARE_SGR_SEQUENCE = /\[(\d+(?:;\d+)*)m/g;

const ANSI_COLORS: Record<number, string> = {
  30: "#1f1f21",
  31: "#ff2e3f",
  32: "#0dbe4e",
  33: "#ffca00",
  34: "#009fff",
  35: "#c635e4",
  36: "#08c0ef",
  37: "#c6c6c8",
  90: "#8e8e95",
  91: "#ff6b76",
  92: "#3ddc72",
  93: "#ffd84d",
  94: "#4db8ff",
  95: "#d86df0",
  96: "#4ad4f5",
  97: "#f5f5f5",
};

function normalizeTerminalBuffer(buffer: string): string {
  return buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function stripControlSequences(line: string): string {
  return line
    .replace(CSI_SEQUENCE, "")
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, "")
    .replace(/\u0008+/g, "");
}

function parseSgrSpans(line: string, theme: TerminalTheme): AnsiSpan[] {
  const normalized = stripControlSequences(line);
  const spans: AnsiSpan[] = [];
  let lastIndex = 0;
  let currentColor = theme.foreground;
  let bold = false;
  let dim = false;

  const push = (end: number) => {
    if (end <= lastIndex) return;
    const text = normalized.slice(lastIndex, end);
    if (text.length === 0) return;
    spans.push({
      text,
      color: currentColor,
      bold,
      dim,
    });
  };

  const applyCodes = (rawCodes: string) => {
    const codes = rawCodes.length === 0 ? [0] : rawCodes.split(";").map((value) => Number(value));
    for (const code of codes) {
      if (code === 0) {
        currentColor = theme.foreground;
        bold = false;
        dim = false;
      } else if (code === 1) {
        bold = true;
      } else if (code === 2) {
        dim = true;
      } else if (code === 22) {
        bold = false;
        dim = false;
      } else if (ANSI_COLORS[code]) {
        currentColor = ANSI_COLORS[code] ?? currentColor;
      }
    }
  };

  const regex = new RegExp(`${SGR_SEQUENCE.source}|${BARE_SGR_SEQUENCE.source}`, "g");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalized)) !== null) {
    push(match.index);
    applyCodes(match[1] ?? "");
    lastIndex = match.index + match[0].length;
  }
  push(normalized.length);

  if (spans.length === 0 && normalized.length > 0) {
    spans.push({ text: normalized, color: theme.foreground });
  }

  return spans;
}

function semanticLineStyle(line: string, theme: TerminalTheme): TextStyle | null {
  const plain = stripControlSequences(line).trim();
  if (plain.length === 0) return null;

  if (
    /\b(error|failed|failure|panic|fatal|exception|traceback)\b/i.test(plain) ||
    plain.startsWith("✖") ||
    plain.startsWith("×")
  ) {
    return { color: theme.palette[1] ?? "#ff2e3f", fontWeight: "600" };
  }

  if (/\bwarn(?:ing)?\b/i.test(plain)) {
    return { color: theme.palette[3] ?? "#ffca00" };
  }

  if (/^›\s/.test(plain) || /^\$\s/.test(plain) || /^>\s/.test(plain)) {
    return { color: theme.palette[4] ?? "#009fff", fontWeight: "600" };
  }

  if (/^[@\w.-]+@[\w.-]+/.test(plain) || /\bon\s+[\w./-]+\s+on\s+/i.test(plain)) {
    return { color: theme.palette[2] ?? "#0dbe4e" };
  }

  return null;
}

function isNoiseLine(line: string): boolean {
  const plain = stripControlSequences(line).trim();
  if (plain.length === 0) return true;
  if (/^\[[0-9]+;[0-9]+[A-Z]/.test(plain)) return true;
  if (/^Native terminal unavailable/i.test(plain)) return false;
  if (/^[\[\]0-9;?HJKlsu]+$/.test(plain)) return true;
  return false;
}

function TerminalLine(props: { readonly line: string; readonly theme: TerminalTheme }) {
  const semantic = semanticLineStyle(props.line, props.theme);
  const spans = parseSgrSpans(props.line, props.theme);

  return (
    <Text
      style={{
        fontFamily: "Menlo",
        fontSize: 11,
        lineHeight: 16,
        marginBottom: 1,
      }}
    >
      {spans.map((span, index) => (
        <Text
          key={`${index}:${span.text.slice(0, 12)}`}
          style={{
            color: semantic?.color ?? span.color,
            fontWeight: semantic?.fontWeight ?? (span.bold ? "700" : "400"),
            opacity: span.dim ? 0.72 : 1,
          }}
        >
          {span.text}
        </Text>
      ))}
    </Text>
  );
}

export const TerminalAnsiText = memo(function TerminalAnsiText(props: {
  readonly buffer: string;
  readonly theme: TerminalTheme;
  readonly maxLines?: number;
}) {
  const lines = useMemo(() => {
    const all = normalizeTerminalBuffer(applyTerminalDisplayBuffer(props.buffer))
      .split("\n")
      .filter((line) => !isNoiseLine(line));
    const max = props.maxLines ?? 400;
    if (all.length <= max) {
      return all;
    }
    return ["… earlier output truncated …", ...all.slice(-max)];
  }, [props.buffer, props.maxLines]);

  return (
    <View>
      {lines.map((line, index) => (
        <TerminalLine key={`${index}:${line.slice(0, 24)}`} line={line} theme={props.theme} />
      ))}
    </View>
  );
});