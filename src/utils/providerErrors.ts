const USAGE_LIMIT_PATTERNS = [
  /you['’]ve hit your usage limit/i,
  /\busage limit\b/i,
  /\brate limit(?: exceeded)?\b/i,
  /\bquota exceeded\b/i,
  /\binsufficient[_ ]quota\b/i,
  /\btoo many requests\b/i,
] as const;

const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  openai: "OpenAI",
  anthropic: "Claude",
  claude: "Claude",
  cursor: "Cursor",
  opencode: "OpenCode",
  codex: "OpenAI Codex",
  gemini: "Gemini",
  google: "Google",
};

function normalizeProviderId(value: string): string {
  return value.trim().toLowerCase();
}

export function extractProviderLabel(message: string): string {
  const cliMatch = message.match(/([A-Za-z][A-Za-z0-9]+)\s+CLI command failed/i);
  if (cliMatch) {
    const cliName = normalizeProviderId(cliMatch[1]);
    if (cliName === "codex") return "OpenAI Codex";
    return PROVIDER_LABELS[cliName] ?? cliMatch[1];
  }

  if (/\bcodex\b/i.test(message)) return "OpenAI Codex";

  const providerLine = message.match(/^provider:\s*(\S+)/im);
  if (providerLine) {
    const providerId = normalizeProviderId(providerLine[1]);
    if (providerId.includes("codex")) return "OpenAI Codex";
    return PROVIDER_LABELS[providerId] ?? providerLine[1];
  }
  if (/\bclaude\b/i.test(message)) return "Claude";
  if (/\bcursor\b/i.test(message)) return "Cursor";
  if (/\bopencode\b/i.test(message)) return "OpenCode";

  return "your provider";
}

export function isUsageLimitError(message: string): boolean {
  return USAGE_LIMIT_PATTERNS.some((pattern) => pattern.test(message));
}

function extractRetryHint(message: string): string | null {
  const match = message.match(/try again at ([^\n.]+(?:\s*(?:AM|PM))?)/i);
  if (!match) return null;
  return ` Try again at ${match[1].trim()}.`;
}

export function formatUsageLimitMessage(message: string): string {
  const provider = extractProviderLabel(message);
  const retryHint = extractRetryHint(message) ?? "";
  return `You've reached your usage limit with ${provider}.${retryHint}`;
}

function stripVerboseCliPayload(message: string): string {
  let compact = message;
  for (const marker of ["Staged patch:", "Staged files:", "diff --git "]) {
    const index = compact.indexOf(marker);
    if (index !== -1) {
      compact = compact.slice(0, index).trimEnd();
    }
  }
  return compact;
}

function extractLastErrorLine(message: string): string | null {
  const matches = [...message.matchAll(/^ERROR:\s*(.+)$/gim)];
  if (matches.length === 0) return null;
  return matches[matches.length - 1]?.[1]?.trim() ?? null;
}

function compactLongCliOutput(message: string): string {
  const lastError = extractLastErrorLine(message);
  if (lastError) {
    if (isUsageLimitError(lastError)) {
      return formatUsageLimitMessage(message);
    }
    const prefix = message.includes("Text generation failed")
      ? "Text generation failed"
      : message.split("\n")[0]?.trim() ?? "Command failed";
    const compact = `${prefix}: ${lastError}`;
    return compact.length <= 280 ? compact : `${compact.slice(0, 277)}…`;
  }

  if (message.length <= 280) return message;

  const separatorIndex = message.indexOf("\n--------\n");
  if (separatorIndex !== -1) {
    const head = message.slice(0, separatorIndex).trim();
    if (head.length > 0) return head.length <= 280 ? head : `${head.slice(0, 277)}…`;
  }

  const firstLine = message.split("\n")[0]?.trim();
  if (firstLine) return firstLine.length <= 280 ? firstLine : `${firstLine.slice(0, 277)}…`;

  return `${message.slice(0, 277)}…`;
}

export function compactProviderError(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return trimmed;

  const lastError = extractLastErrorLine(trimmed);
  if (isUsageLimitError(trimmed) || (lastError !== null && isUsageLimitError(lastError))) {
    return formatUsageLimitMessage(trimmed);
  }

  if (lastError) {
    const withoutPayload = stripVerboseCliPayload(trimmed);
    const prefix = withoutPayload.includes("Text generation failed")
      ? "Text generation failed"
      : withoutPayload.split("\n")[0]?.trim() ?? "Command failed";
    const compact = `${prefix}: ${lastError}`;
    return compact.length <= 280 ? compact : `${compact.slice(0, 277)}…`;
  }

  return compactLongCliOutput(stripVerboseCliPayload(trimmed));
}

export function formatUserFacingError(error: unknown, fallback = "Something went wrong."): string {
  if (error instanceof Error && error.message.trim()) {
    return compactProviderError(error.message);
  }
  if (typeof error === "string" && error.trim()) {
    return compactProviderError(error);
  }
  if (typeof error === "object" && error !== null) {
    const tagged = error as {
      readonly message?: string;
      readonly reason?: string;
      readonly detail?: string;
    };
    const candidate = tagged.message ?? tagged.reason ?? tagged.detail;
    if (typeof candidate === "string" && candidate.trim()) {
      return compactProviderError(candidate);
    }
  }
  return fallback;
}