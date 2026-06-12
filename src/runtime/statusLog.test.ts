import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearStatusHistory,
  formatRemoteError,
  getStatusHistory,
  logStatus,
  sanitizeStatusText,
  setMinimalLoggingEnabled,
  shouldShowStatusToast,
} from "./statusLog";

describe("status logging", () => {
  afterEach(() => {
    clearStatusHistory();
    vi.restoreAllMocks();
  });

  it("redacts pairing, bearer, and WebSocket credentials", () => {
    expect(
      sanitizeStatusText(
        'ws://host/ws?ticket=secret&token=also-secret Bearer abc.def {"bearerToken":"hidden"}'
      )
    ).toBe(
      'ws://host/ws?ticket=[redacted]&token=[redacted] Bearer [redacted] {"bearerToken":"[redacted]"}'
    );
  });

  it("compacts provider usage limit failures", () => {
    expect(
      formatRemoteError(
        new Error(
          "Text generation failed in generateCommitMessage: Codex CLI command failed\nprovider: openai\nERROR: You've hit your usage limit. Try again at 10:38 PM."
        )
      )
    ).toBe("You've reached your usage limit with OpenAI Codex. Try again at 10:38 PM.");
  });

  it("filters routine toasts when minimal logging is enabled", () => {
    setMinimalLoggingEnabled(true);
    expect(
      shouldShowStatusToast({
        level: "info",
        toast: true,
      })
    ).toBe(false);
    expect(
      shouldShowStatusToast({
        level: "danger",
        toast: true,
      })
    ).toBe(true);
    expect(
      shouldShowStatusToast({
        level: "warning",
        phase: "disconnected",
        toast: true,
      })
    ).toBe(true);
    setMinimalLoggingEnabled(false);
  });

  it("keeps a structured bounded history", () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    for (let index = 0; index < 125; index += 1) {
      logStatus("shell", "info", `Sync ${index}`, `ticket=secret-${index}`, { toast: false });
    }

    const history = getStatusHistory();
    expect(history).toHaveLength(120);
    expect(history[0]?.label).toBe("Sync 5");
    expect(history.at(-1)?.description).toBe("ticket=[redacted]");
    expect(history.at(-1)?.timestamp).toBeTruthy();
  });
});
