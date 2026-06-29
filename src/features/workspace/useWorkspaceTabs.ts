import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { nextTerminalId } from "@t3tools/shared/terminalLabels";
import { useCallback, useEffect, useRef, useState } from "react";

import { loadWorkspaceTabs, saveWorkspaceTabs } from "@/runtime/db";
import { randomHex } from "@/utils/randomHex";
import { workspaceLog } from "./workspaceLog";
import type { WorkspaceTab, WorkspaceToolKind } from "./workspaceTypes";

function createTabId(): string {
  return randomHex(8);
}

function createPickerTab(): WorkspaceTab {
  return { id: createTabId(), kind: "picker" };
}

function collectTerminalIds(tabs: readonly WorkspaceTab[]): string[] {
  return tabs
    .filter((tab): tab is Extract<WorkspaceTab, { kind: "terminal" }> => tab.kind === "terminal")
    .map((tab) => tab.terminalId);
}

function createToolTab(kind: WorkspaceToolKind, tabs: readonly WorkspaceTab[]): WorkspaceTab {
  switch (kind) {
    case "terminal":
      return {
        id: createTabId(),
        kind: "terminal",
        terminalId: nextTerminalId(collectTerminalIds(tabs)),
      };
    case "browser":
      return { id: createTabId(), kind: "browser" };
    case "files":
      return { id: createTabId(), kind: "files" };
    case "diff":
      return { id: createTabId(), kind: "diff" };
  }
}

const memoryCache = new Map<string, { readonly tabs: readonly WorkspaceTab[]; readonly activeTabId: string }>();

function scopeKey(environmentId: EnvironmentId, threadId: ThreadId): string {
  return `${environmentId}:${threadId}`;
}

function initialStateForScope(key: string): {
  readonly tabs: readonly WorkspaceTab[];
  readonly activeTabId: string;
} {
  const cached = memoryCache.get(key);
  if (cached) {
    return cached;
  }

  const picker = createPickerTab();
  return { tabs: [picker], activeTabId: picker.id };
}

export function useWorkspaceTabs(input: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
}) {
  const key = scopeKey(input.environmentId, input.threadId);
  const initial = initialStateForScope(key);
  const [tabs, setTabs] = useState<readonly WorkspaceTab[]>(initial.tabs);
  const [activeTabId, setActiveTabId] = useState<string>(initial.activeTabId);
  const [hydrated, setHydrated] = useState(memoryCache.has(key));
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    workspaceLog("tabs", "hydrate:start", { key });

    void loadWorkspaceTabs(input.environmentId, input.threadId).then((saved) => {
      if (cancelled) {
        return;
      }

      if (saved) {
        memoryCache.set(key, { tabs: saved.tabs, activeTabId: saved.activeTabId });
        setTabs(saved.tabs);
        setActiveTabId(saved.activeTabId);
        workspaceLog("tabs", "hydrate:restored", {
          key,
          tabCount: saved.tabs.length,
          activeTabId: saved.activeTabId,
        });
      } else {
        workspaceLog("tabs", "hydrate:empty", { key });
      }
      setHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, [input.environmentId, input.threadId, key]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    memoryCache.set(key, { tabs, activeTabId });
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = setTimeout(() => {
      persistTimerRef.current = null;
      void saveWorkspaceTabs(input.environmentId, input.threadId, {
        tabs,
        activeTabId,
        updatedAt: new Date().toISOString(),
      });
      workspaceLog("tabs", "persist", { key, tabCount: tabs.length, activeTabId });
    }, 250);

    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
    };
  }, [activeTabId, hydrated, input.environmentId, input.threadId, key, tabs]);

  const addTab = useCallback(() => {
    const next = createPickerTab();
    setTabs((current) => [...current, next]);
    setActiveTabId(next.id);
    workspaceLog("tabs", "add", { tabId: next.id });
  }, []);

  const closeTab = useCallback((tabId: string) => {
    setTabs((current) => {
      if (current.length <= 1) {
        const replacement = createPickerTab();
        setActiveTabId(replacement.id);
        workspaceLog("tabs", "close:reset", { tabId, replacementId: replacement.id });
        return [replacement];
      }

      const index = current.findIndex((tab) => tab.id === tabId);
      if (index < 0) return current;

      const nextTabs = current.filter((tab) => tab.id !== tabId);
      setActiveTabId((currentActive) => {
        if (currentActive !== tabId) return currentActive;
        const fallback = nextTabs[Math.max(0, index - 1)] ?? nextTabs[0];
        return fallback?.id ?? "";
      });
      workspaceLog("tabs", "close", { tabId, remaining: nextTabs.length });
      return nextTabs;
    });
  }, []);

  const selectTool = useCallback((tabId: string, kind: WorkspaceToolKind) => {
    setTabs((current) =>
      current.map((tab) => (tab.id === tabId ? createToolTab(kind, current) : tab))
    );
    setActiveTabId(tabId);
    workspaceLog("tabs", "select-tool", { tabId, kind });
  }, []);

  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0] ?? null;

  return {
    tabs,
    activeTab,
    activeTabId,
    setActiveTabId,
    addTab,
    closeTab,
    selectTool,
    hydrated,
  };
}