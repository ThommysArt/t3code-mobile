import { describe, expect, it } from "vitest";

import {
  resolveTerminalRouteBootstrap,
  resolveWorkspaceTerminalBootstrap,
} from "./terminalRouteBootstrap";

describe("resolveWorkspaceTerminalBootstrap", () => {
  it("returns idle when not live", () => {
    expect(
      resolveWorkspaceTerminalBootstrap({
        hasWorkspaceRoot: true,
        hasOpened: false,
        live: false,
      })
    ).toEqual({ kind: "idle" });
  });

  it("returns idle when already opened", () => {
    expect(
      resolveWorkspaceTerminalBootstrap({
        hasWorkspaceRoot: true,
        hasOpened: true,
        live: true,
      })
    ).toEqual({ kind: "idle" });
  });

  it("returns open when live with workspace root and not yet opened", () => {
    expect(
      resolveWorkspaceTerminalBootstrap({
        hasWorkspaceRoot: true,
        hasOpened: false,
        live: true,
      })
    ).toEqual({ kind: "open" });
  });
});

describe("resolveTerminalRouteBootstrap", () => {
  it("skips attach when terminal is running and hydrated", () => {
    expect(
      resolveTerminalRouteBootstrap({
        hasThread: true,
        hasWorkspaceRoot: true,
        hasOpened: false,
        requestedTerminalId: "term-1",
        currentTerminalId: "term-1",
        runningTerminalId: "term-1",
        currentTerminalStatus: "running",
        hasCurrentTerminalHydration: true,
      })
    ).toEqual({ kind: "idle" });
  });

  it("opens when running but buffer is empty", () => {
    expect(
      resolveTerminalRouteBootstrap({
        hasThread: true,
        hasWorkspaceRoot: true,
        hasOpened: false,
        requestedTerminalId: "term-1",
        currentTerminalId: "term-1",
        runningTerminalId: "term-1",
        currentTerminalStatus: "running",
        hasCurrentTerminalHydration: false,
      })
    ).toEqual({ kind: "open" });
  });
});