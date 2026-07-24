import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearStatusHistory,
  formatRemoteError,
  getStatusHistory,
  logStatus,
  sanitizeStatusText,
  setLessToastsEnabled,
  shouldShowStatusToast,
} from "./statusLog";

describe("status logging", () => {
  afterEach(() => {
    clearStatusHistory();
    setLessToastsEnabled(true);
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

  it("with less toasts on, keeps connection lifecycle ambient and only surfaces important toasts", () => {
    setLessToastsEnabled(true);
    expect(
      shouldShowStatusToast({
        level: "info",
        phase: "connecting",
        scope: "environment",
      })
    ).toBe(false);
    expect(
      shouldShowStatusToast({
        level: "success",
        phase: "connected",
        scope: "environment",
        persistent: true,
      })
    ).toBe(false);
    expect(
      shouldShowStatusToast({
        level: "info",
        phase: "syncing",
        scope: "shell",
        persistent: true,
      })
    ).toBe(false);
    expect(
      shouldShowStatusToast({
        level: "info",
        scope: "thread",
      })
    ).toBe(false);
    expect(
      shouldShowStatusToast({
        level: "warning",
        phase: "disconnected",
        scope: "environment",
      })
    ).toBe(false);
    expect(
      shouldShowStatusToast({
        level: "danger",
        scope: "thread",
      })
    ).toBe(true);
    expect(
      shouldShowStatusToast({
        level: "success",
        scope: "git",
      })
    ).toBe(true);
    expect(
      shouldShowStatusToast({
        level: "info",
        toast: true,
        scope: "environment",
      })
    ).toBe(true);
  });

  it("with less toasts off, shows verbose status toasts", () => {
    setLessToastsEnabled(false);
    expect(
      shouldShowStatusToast({
        level: "info",
        phase: "connecting",
        scope: "environment",
      })
    ).toBe(true);
    expect(
      shouldShowStatusToast({
        level: "success",
        phase: "connected",
        scope: "environment",
      })
    ).toBe(true);
    expect(
      shouldShowStatusToast({
        level: "info",
        scope: "thread",
      })
    ).toBe(true);
    expect(
      shouldShowStatusToast({
        level: "info",
        toast: false,
        scope: "thread",
      })
    ).toBe(false);
    expect(
      shouldShowStatusToast({
        level: "danger",
        scope: "thread",
      })
    ).toBe(true);
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
