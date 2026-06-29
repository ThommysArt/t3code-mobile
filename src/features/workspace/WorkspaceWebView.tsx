import type { ComponentRef } from "react";
import { forwardRef } from "react";
import RNWebView from "react-native-webview";
import type { WebViewProps } from "react-native-webview";

export type WorkspaceWebViewRef = ComponentRef<typeof RNWebView>;

export const WorkspaceWebView = forwardRef<WorkspaceWebViewRef, WebViewProps>(
  function WorkspaceWebView(props, ref) {
    return <RNWebView ref={ref} {...props} />;
  }
);