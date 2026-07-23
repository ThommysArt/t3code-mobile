import { Platform } from "react-native";
import type { EnvironmentScopedThreadShell } from "@t3tools/client-runtime";
import type { EnvironmentId } from "@t3tools/contracts";

import { LatestThreadsWidget } from "./LatestThreadsWidget";
import { LATEST_THREADS_WIDGET_NAME } from "./latestThreads";
import { loadLatestThreadsSelection } from "./loadLatestThreadsSelection";

/**
 * Push the current catalog into any installed Latest Threads home-screen widgets.
 * No-ops on non-Android platforms and when no widget is present.
 */
export async function syncLatestThreadsWidget(input?: {
  readonly threads?: ReadonlyArray<EnvironmentScopedThreadShell>;
  readonly projectTitleByKey?: ReadonlyMap<string, string>;
  readonly settlementEnvironmentIds?: ReadonlySet<EnvironmentId>;
  readonly autoSettleAfterDays?: number | null;
}): Promise<void> {
  if (Platform.OS !== "android") return;

  try {
    const { requestWidgetUpdate } = await import("react-native-android-widget");
    const selection = await loadLatestThreadsSelection(input);
    const nowMs = Date.now();

    await requestWidgetUpdate({
      widgetName: LATEST_THREADS_WIDGET_NAME,
      renderWidget: () => ({
        light: <LatestThreadsWidget selection={selection} theme="light" nowMs={nowMs} />,
        dark: <LatestThreadsWidget selection={selection} theme="dark" nowMs={nowMs} />,
      }),
      widgetNotFound: () => {
        // User has not added the widget — nothing to do.
      },
    });
  } catch {
    // Widget native module may be missing in Expo Go / web / partial builds.
  }
}
