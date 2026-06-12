import { describe, expect, it } from "vitest";

import {
  compactProviderError,
  formatUsageLimitMessage,
  formatUserFacingError,
  isUsageLimitError,
} from "./providerErrors";

const USAGE_LIMIT_ERROR = `Text generation failed in generateCommitMessage: Codex CLI command failed: OpenAI Codex v0.139.0
--------
workdir: /home/thommysart/Works/scraps/t3code-mobile
model: gpt-5.4-mini
provider: openai
approval: never
sandbox: read-only
reasoning effort: low
reasoning summaries: none
session id: 019ebdbe-45f1-7122-8111-1db93ec1da76
--------
user
You write concise git commit messages.

Staged patch:
diff --git a/src/features/git/GitScreen.tsx b/src/features/git/GitScreen.tsx
index 013685f..2383b59 100644
--- a/src/features/git/GitScreen.tsx
+++ b/src/features/git/GitScreen.tsx
@@ -166,8 +166,8 @@ export function GitScreen() {

ERROR: You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 10:38 PM.
ERROR: You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), visit https://chatgpt.com/codex/settings/usage to purchase more credits or try again at 10:38 PM.`;

describe("provider error compaction", () => {
  it("detects provider usage limit errors", () => {
    expect(isUsageLimitError(USAGE_LIMIT_ERROR)).toBe(true);
    expect(compactProviderError(USAGE_LIMIT_ERROR)).toBe(
      "You've reached your usage limit with OpenAI Codex. Try again at 10:38 PM."
    );
  });

  it("formats usage limit messages with provider labels", () => {
    expect(
      formatUsageLimitMessage("provider: anthropic\nERROR: rate limit exceeded")
    ).toBe("You've reached your usage limit with Claude.");
  });

  it("compacts long non-limit CLI failures to the last error line", () => {
    const message = `Text generation failed in generateCommitMessage: Codex CLI command failed
--------
provider: openai
Staged patch:
diff --git a/file.ts b/file.ts
ERROR: sandbox denied write access`;

    expect(compactProviderError(message)).toBe(
      "Text generation failed: sandbox denied write access"
    );
  });

  it("formats unknown errors through formatUserFacingError", () => {
    expect(formatUserFacingError(new Error(USAGE_LIMIT_ERROR))).toBe(
      "You've reached your usage limit with OpenAI Codex. Try again at 10:38 PM."
    );
    expect(formatUserFacingError("plain failure")).toBe("plain failure");
    expect(formatUserFacingError(null, "Fallback")).toBe("Fallback");
  });
});