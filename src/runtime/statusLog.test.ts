import { afterEach, describe, expect, it, vi } from "vitest";

import { clearStatusHistory, getStatusHistory, logStatus, sanitizeStatusText } from "./statusLog";

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
