import { DEFAULT_TERMINAL_ID, EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { TerminalAttachStreamEvent } from "@t3tools/contracts";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { AppIcon } from "@/components/AppIcon";
import { FloatingBottomChrome } from "@/components/FloatingBottomChrome";
import { useChromeTheme } from "@/components/chrome/useChromeTheme";
import { TerminalSurface } from "@/features/terminal/NativeTerminalSurface";
import { TerminalQuickKeys } from "@/features/terminal/TerminalQuickKeys";
import { hasNativeTerminalSurface } from "@/features/terminal/nativeTerminalModule";
import { resolveTerminalOpenLocation } from "@/features/terminal/terminalLaunchContext";
import {
  pickRunningTerminalSessionForBootstrap,
  resolveWorkspaceTerminalBootstrap,
} from "@/features/terminal/terminalRouteBootstrap";
import { getPierreTerminalTheme } from "@/features/terminal/terminalTheme";
import { useEnvironments } from "@/runtime/EnvironmentProvider";
import {
  attachTerminalSession,
  useKnownTerminalSessions,
  useTerminalSession,
  useTerminalSessionTarget,
} from "@/runtime/useTerminalSession";
import { workspaceError, workspaceLog } from "./workspaceLog";

const DEFAULT_TERMINAL_COLS = 80;
const DEFAULT_TERMINAL_ROWS = 24;

export const WorkspaceTerminalTab = memo(function WorkspaceTerminalTab(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly workspaceRoot: string;
  readonly worktreePath: string | null;
  readonly terminalId?: string;
  readonly live: boolean;
}) {
  const theme = useChromeTheme();
  const terminalTheme = getPierreTerminalTheme(theme.isDark ? "dark" : "light");
  const { getClient } = useEnvironments();
  const terminalId = props.terminalId ?? DEFAULT_TERMINAL_ID;
  const target = useTerminalSessionTarget({
    environmentId: props.environmentId,
    threadId: props.threadId,
    terminalId,
  });
  const terminal = useTerminalSession(target);
  const knownSessions = useKnownTerminalSessions({
    environmentId: props.environmentId,
    threadId: props.threadId,
  });
  const runningSession = useMemo(
    () => pickRunningTerminalSessionForBootstrap(knownSessions),
    [knownSessions]
  );
  const activeKnownSession = useMemo(
    () => knownSessions.find((session) => session.target.terminalId === terminalId) ?? null,
    [knownSessions, terminalId]
  );

  const [lastGridSize, setLastGridSize] = useState({
    cols: DEFAULT_TERMINAL_COLS,
    rows: DEFAULT_TERMINAL_ROWS,
  });
  const [inputValue, setInputValue] = useState("");
  const [bottomChromeHeight, setBottomChromeHeight] = useState(72);

  const lastGridSizeRef = useRef(lastGridSize);
  lastGridSizeRef.current = lastGridSize;

  const hasOpenedRef = useRef(false);
  const attachStreamLogCountRef = useRef(0);

  const terminalKey = `${props.environmentId}:${props.threadId}:${terminalId}`;
  const isRunning = terminal.status === "running" || terminal.status === "starting";
  const nativeAvailable = hasNativeTerminalSurface();

  const workspaceRootRef = useRef(props.workspaceRoot);
  workspaceRootRef.current = props.workspaceRoot;
  const worktreePathRef = useRef(props.worktreePath);
  worktreePathRef.current = props.worktreePath;
  const environmentIdRef = useRef(props.environmentId);
  environmentIdRef.current = props.environmentId;
  const threadIdRef = useRef(props.threadId);
  threadIdRef.current = props.threadId;
  const terminalIdRef = useRef(terminalId);
  terminalIdRef.current = terminalId;

  const terminalAttachLaunchHintsRef = useRef({
    terminalSummary: terminal.summary,
    activeKnownSummary: activeKnownSession?.state.summary ?? null,
  });
  terminalAttachLaunchHintsRef.current = {
    terminalSummary: terminal.summary,
    activeKnownSummary: activeKnownSession?.state.summary ?? null,
  };

  const logAttachStreamEvent = useCallback((event: TerminalAttachStreamEvent) => {
    const n = ++attachStreamLogCountRef.current;
    if (event.type === "output" && n > 32 && n % 64 !== 0) {
      return;
    }
    if (event.type === "snapshot") {
      workspaceLog("terminal", "attach:stream", {
        n,
        type: event.type,
        status: event.snapshot.status,
        historyLen: event.snapshot.history.length,
        cwd: event.snapshot.cwd,
      });
      return;
    }
    if (event.type === "output") {
      workspaceLog("terminal", "attach:stream", { n, type: event.type, dataLen: event.data.length });
      return;
    }
    workspaceLog("terminal", "attach:stream", { n, type: event.type });
  }, []);

  const attachTerminal = useCallback(() => {
    const client = getClient(environmentIdRef.current);
    if (!client) {
      workspaceLog("terminal", "attach:abort", {
        reason: "no-environment-client",
        environmentId: environmentIdRef.current,
      });
      return null;
    }

    const launchLocation = resolveTerminalOpenLocation({
      terminalLocation: terminalAttachLaunchHintsRef.current.terminalSummary,
      activeSessionLocation: terminalAttachLaunchHintsRef.current.activeKnownSummary,
      workspaceRoot: workspaceRootRef.current,
      worktreePath: worktreePathRef.current,
    });

    workspaceLog("terminal", "attach:start", {
      terminalId: terminalIdRef.current,
      threadId: threadIdRef.current,
      cols: lastGridSizeRef.current.cols,
      rows: lastGridSizeRef.current.rows,
      cwd: launchLocation.cwd,
      worktreePath: launchLocation.worktreePath,
    });

    try {
      return attachTerminalSession({
        environmentId: environmentIdRef.current,
        client,
        terminal: {
          threadId: threadIdRef.current,
          terminalId: terminalIdRef.current,
          cwd: launchLocation.cwd,
          worktreePath: launchLocation.worktreePath,
          cols: lastGridSizeRef.current.cols,
          rows: lastGridSizeRef.current.rows,
        },
        onEvent: logAttachStreamEvent,
      });
    } catch (error) {
      workspaceError("terminal", "attach:error", {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }, [getClient, logAttachStreamEvent]);

  const attachTerminalRef = useRef(attachTerminal);
  attachTerminalRef.current = attachTerminal;
  const runningSessionRef = useRef(runningSession);
  runningSessionRef.current = runningSession;
  const terminalBootstrapRef = useRef({
    status: terminal.status,
    bufferLen: terminal.buffer.length,
  });
  terminalBootstrapRef.current = {
    status: terminal.status,
    bufferLen: terminal.buffer.length,
  };

  useEffect(() => {
    hasOpenedRef.current = false;
    attachStreamLogCountRef.current = 0;
    workspaceLog("terminal", "session:reset", { terminalKey });
  }, [terminalKey]);

  useEffect(() => {
    const bootstrapAction = resolveWorkspaceTerminalBootstrap({
      hasWorkspaceRoot: Boolean(workspaceRootRef.current),
      hasOpened: hasOpenedRef.current,
      live: props.live,
    });

    if (bootstrapAction.kind !== "idle") {
      workspaceLog("terminal", "bootstrap:action", {
        kind: bootstrapAction.kind,
        hasOpenedBefore: hasOpenedRef.current,
        terminalStatus: terminalBootstrapRef.current.status,
        bufLen: terminalBootstrapRef.current.bufferLen,
        runningTerminalId: runningSessionRef.current?.target.terminalId ?? null,
      });
    }

    if (bootstrapAction.kind === "idle") {
      return;
    }

    hasOpenedRef.current = true;
    try {
      const detach = attachTerminalRef.current();
      workspaceLog("terminal", "bootstrap:subscribe", { hasDetach: Boolean(detach) });
      if (!detach) {
        hasOpenedRef.current = false;
        return;
      }

      return () => {
        detach();
        hasOpenedRef.current = false;
        workspaceLog("terminal", "bootstrap:unsubscribe", { terminalKey });
      };
    } catch (error) {
      hasOpenedRef.current = false;
      workspaceError("terminal", "bootstrap:attach-threw", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, [props.live, props.environmentId, props.threadId, props.workspaceRoot, terminalId, terminalKey]);

  const handleInput = useCallback(
    (data: string) => {
      const client = getClient(props.environmentId);
      if (!client || !isRunning) return;

      void client.terminal.write({
        threadId: props.threadId,
        terminalId,
        data,
      });
    },
    [getClient, isRunning, props.environmentId, props.threadId, terminalId]
  );

  const handleResize = useCallback(
    (size: { readonly cols: number; readonly rows: number }) => {
      if (size.cols === lastGridSize.cols && size.rows === lastGridSize.rows) return;

      setLastGridSize(size);
      const client = getClient(props.environmentId);
      if (!client || !isRunning) return;

      workspaceLog("terminal", "resize", {
        terminalId,
        cols: size.cols,
        rows: size.rows,
      });

      void client.terminal.resize({
        threadId: props.threadId,
        terminalId,
        cols: size.cols,
        rows: size.rows,
      });
    },
    [
      getClient,
      isRunning,
      lastGridSize.cols,
      lastGridSize.rows,
      props.environmentId,
      props.threadId,
      terminalId,
    ]
  );

  const handleClear = useCallback(() => {
    const client = getClient(props.environmentId);
    if (!client) return;

    workspaceLog("terminal", "clear", { terminalId });
    void client.terminal.clear({
      threadId: props.threadId,
      terminalId,
    });
  }, [getClient, props.environmentId, props.threadId, terminalId]);

  const submitLine = useCallback(() => {
    if (inputValue.length === 0) return;
    handleInput(`${inputValue}\n`);
    setInputValue("");
  }, [handleInput, inputValue]);

  const submitRawKey = useCallback(() => {
    if (inputValue.length === 0) return;
    handleInput(inputValue);
    setInputValue("");
  }, [handleInput, inputValue]);

  if (!props.live) {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <AppIcon name="wifi" size={28} color={theme.muted} />
        <Text className="text-center text-base font-semibold text-foreground">
          Live connection required
        </Text>
        <Text className="text-center text-sm leading-6 text-muted">
          Terminal access needs an active WebSocket session to your T3 Code server.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View
        className="flex-row items-center justify-between border-b border-border px-4 py-2.5"
        style={{ backgroundColor: theme.surface }}
      >
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
            {terminal.summary?.label ?? `Terminal ${terminalId}`}
          </Text>
          <Text className="text-[11px] text-muted" numberOfLines={1}>
            {nativeAvailable ? "Ghostty renderer" : "Text fallback"} · {terminal.status}
          </Text>
        </View>
        <View className="flex-row items-center gap-2">
          {terminal.status === "starting" ? (
            <ActivityIndicator color="#f97316" size="small" />
          ) : null}
          {terminal.error ? (
            <Text className="max-w-40 text-right text-[11px] text-red-400" numberOfLines={1}>
              {terminal.error}
            </Text>
          ) : null}
          <Pressable
            accessibilityLabel="Clear terminal"
            accessibilityRole="button"
            onPress={handleClear}
            className="h-8 w-8 items-center justify-center rounded-full bg-default"
          >
            <AppIcon name="x" size={14} color={theme.foreground} />
          </Pressable>
        </View>
      </View>

      <View className="flex-1">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingBottom: bottomChromeHeight + 12, paddingHorizontal: 8 }}
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          <TerminalSurface
            terminalKey={terminalKey}
            buffer={terminal.buffer}
            isRunning={isRunning}
            onInput={handleInput}
            onResize={handleResize}
            renderInput={false}
            theme={terminalTheme}
            style={{ flex: 1, minHeight: 280 }}
          />
        </ScrollView>

        <FloatingBottomChrome onHeightChange={setBottomChromeHeight}>
          <View className="gap-2" style={{ width: "100%" }}>
            <TerminalQuickKeys disabled={!isRunning} onSend={handleInput} />
            <View
              className="flex-row items-center gap-2 rounded-full border px-3 py-2"
              style={{
                borderColor: theme.border,
                backgroundColor: theme.surface,
              }}
            >
              <TextInput
                accessibilityLabel="Terminal input"
                autoCapitalize="none"
                autoCorrect={false}
                blurOnSubmit={false}
                editable={isRunning}
                value={inputValue}
                onChangeText={setInputValue}
                placeholder="Command line input"
                placeholderTextColor={theme.muted}
                returnKeyType="send"
                onSubmitEditing={submitLine}
                style={{
                  flex: 1,
                  color: theme.foreground,
                  fontFamily: "Menlo",
                  fontSize: 13,
                  padding: 0,
                }}
              />
              <Pressable
                disabled={!isRunning || inputValue.length === 0}
                onPress={submitRawKey}
                className="rounded-full bg-default px-3 py-1.5"
              >
                <Text className="text-[11px] font-semibold text-foreground">Key</Text>
              </Pressable>
              <Pressable
                disabled={!isRunning || inputValue.length === 0}
                onPress={submitLine}
                className="h-8 w-8 items-center justify-center rounded-full bg-accent"
              >
                <AppIcon name="arrow-up" size={16} color="#ffffff" strokeWidth={2.3} />
              </Pressable>
            </View>
          </View>
        </FloatingBottomChrome>
      </View>
    </View>
  );
});