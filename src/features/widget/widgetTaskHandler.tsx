import React from "react";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";

import { LatestThreadsWidget } from "./LatestThreadsWidget";
import { LATEST_THREADS_WIDGET_NAME } from "./latestThreads";
import { loadLatestThreadsSelection } from "./loadLatestThreadsSelection";

async function renderLatestThreadsWidget(
  props: WidgetTaskHandlerProps
): Promise<void> {
  const selection = await loadLatestThreadsSelection();
  const nowMs = Date.now();
  props.renderWidget({
    light: <LatestThreadsWidget selection={selection} theme="light" nowMs={nowMs} />,
    dark: <LatestThreadsWidget selection={selection} theme="dark" nowMs={nowMs} />,
  });
}

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  if (props.widgetInfo.widgetName !== LATEST_THREADS_WIDGET_NAME) {
    return;
  }

  switch (props.widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED":
      await renderLatestThreadsWidget(props);
      break;
    case "WIDGET_CLICK":
      // Deep links use OPEN_URI / OPEN_APP specials; no custom click actions yet.
      break;
    case "WIDGET_DELETED":
      break;
    default:
      break;
  }
}
