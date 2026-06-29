import type { EnvironmentId } from "@t3tools/contracts";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { WebViewNavigation } from "react-native-webview";
import type { ShouldStartLoadRequest } from "react-native-webview/lib/WebViewTypes";

import { WorkspaceWebView, type WorkspaceWebViewRef } from "./WorkspaceWebView";

import { AppIcon } from "@/components/AppIcon";
import { useChromeTheme } from "@/components/chrome/useChromeTheme";
import { useDiscoveredLocalServers } from "@/runtime/useDiscoveredLocalServers";
import { useEnvironments } from "@/runtime/EnvironmentProvider";
import { extractRemoteHost, rewriteLocalDevUrl } from "@/utils/rewriteLocalUrl";
import { workspaceLog } from "./workspaceLog";

export const WorkspaceBrowserTab = memo(function WorkspaceBrowserTab(props: {
  readonly environmentId: EnvironmentId;
  readonly live: boolean;
}) {
  const theme = useChromeTheme();
  const { getEnvironment } = useEnvironments();
  const discovered = useDiscoveredLocalServers(props.environmentId, props.live);
  const environment = getEnvironment(props.environmentId);
  const remoteHost = extractRemoteHost(environment?.connection.httpBaseUrl ?? "");
  const webViewRef = useRef<WorkspaceWebViewRef>(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [pageTitle, setPageTitle] = useState<string | null>(null);
  const [pageLoading, setPageLoading] = useState(false);

  useEffect(() => {
    if (!props.live) return;
    workspaceLog("browser", "discover", {
      serverCount: discovered.servers.length,
      scannedAt: discovered.scannedAt,
    });
  }, [discovered.scannedAt, discovered.servers.length, props.live]);

  const openInApp = useCallback(
    (rawUrl: string) => {
      const url = rewriteLocalDevUrl(rawUrl, remoteHost);
      workspaceLog("browser", "open:in-app", { rawUrl, url, remoteHost });
      setActiveUrl(url);
      setPageTitle(null);
      setPageLoading(true);
    },
    [remoteHost]
  );

  const openExternal = useCallback(
    async (rawUrl: string) => {
      const url = rewriteLocalDevUrl(rawUrl, remoteHost);
      workspaceLog("browser", "open:external", { rawUrl, url, remoteHost });
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        workspaceLog("browser", "open:unsupported", { url });
        return;
      }
      await Linking.openURL(url);
    },
    [remoteHost]
  );

  const handleNavigation = useCallback((navigation: WebViewNavigation) => {
    setPageTitle(navigation.title || null);
    setPageLoading(navigation.loading);
  }, []);

  if (!props.live) {
    return (
      <View className="flex-1 items-center justify-center gap-3 px-8">
        <AppIcon name="wifi" size={28} color={theme.muted} />
        <Text className="text-center text-base font-semibold text-foreground">
          Live connection required
        </Text>
        <Text className="text-center text-sm leading-6 text-muted">
          Local server discovery needs an active WebSocket session to your T3 Code server.
        </Text>
      </View>
    );
  }

  if (activeUrl) {
    return (
      <View className="flex-1 bg-background">
        <View
          className="flex-row items-center gap-2 border-b border-border px-3 py-2.5"
          style={{ backgroundColor: theme.surface }}
        >
          <Pressable
            accessibilityLabel="Back to server list"
            accessibilityRole="button"
            onPress={() => {
              setActiveUrl(null);
              setPageTitle(null);
              setPageLoading(false);
            }}
            className="h-8 w-8 items-center justify-center rounded-full bg-default"
          >
            <AppIcon name="back" size={16} color={theme.foreground} />
          </Pressable>
          <View className="min-w-0 flex-1">
            <Text className="text-sm font-semibold text-foreground" numberOfLines={1}>
              {pageTitle ?? "Dev server"}
            </Text>
            <Text className="font-mono text-[10px] text-muted" numberOfLines={1}>
              {activeUrl}
            </Text>
          </View>
          {pageLoading ? <ActivityIndicator color="#f97316" size="small" /> : null}
          <Pressable
            accessibilityLabel="Refresh page"
            accessibilityRole="button"
            onPress={() => webViewRef.current?.reload()}
            className="h-8 w-8 items-center justify-center rounded-full bg-default"
          >
            <AppIcon name="globe" size={15} color={theme.foreground} />
          </Pressable>
          <Pressable
            accessibilityLabel="Open in system browser"
            accessibilityRole="button"
            onPress={() => void openExternal(activeUrl)}
            className="h-8 w-8 items-center justify-center rounded-full bg-default"
          >
            <Text className="text-sm font-semibold text-foreground">↗</Text>
          </Pressable>
        </View>

        <WorkspaceWebView
          ref={webViewRef}
          source={{ uri: activeUrl }}
          onLoadStart={() => setPageLoading(true)}
          onLoadEnd={() => setPageLoading(false)}
          onNavigationStateChange={handleNavigation}
          onShouldStartLoadWithRequest={(request: ShouldStartLoadRequest) => {
            const rewritten = rewriteLocalDevUrl(request.url, remoteHost);
            if (rewritten !== request.url) {
              setActiveUrl(rewritten);
              return false;
            }
            return true;
          }}
          setSupportMultipleWindows={false}
          sharedCookiesEnabled
          style={{ flex: 1, backgroundColor: theme.background }}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View className="border-b border-border px-4 py-3">
        <Text className="text-sm font-semibold text-foreground">Local dev servers</Text>
        <Text className="mt-1 text-xs leading-5 text-muted">
          Opens inside the app so your T3 connection stays alive. Localhost and LAN hosts are
          rewritten to {remoteHost ?? "your connected server"}.
        </Text>
      </View>

      <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, gap: 12 }}>
        {discovered.servers.length === 0 ? (
          <View className="items-center gap-2 py-8">
            <ActivityIndicator color="#f97316" />
            <Text className="text-center text-sm text-muted">
              Scanning for localhost dev servers on your machine…
            </Text>
            {discovered.scannedAt ? (
              <Text className="text-center text-xs text-muted">Last scan {discovered.scannedAt}</Text>
            ) : null}
          </View>
        ) : (
          discovered.servers.map((server) => {
            const rewrittenUrl = rewriteLocalDevUrl(server.url, remoteHost);
            return (
              <Pressable
                key={`${server.host}:${server.port}`}
                accessibilityRole="button"
                onPress={() => openInApp(server.url)}
                className="rounded-2xl border border-border bg-surface px-4 py-3"
              >
                <View className="flex-row items-center justify-between gap-3">
                  <View className="min-w-0 flex-1">
                    <Text className="font-mono text-sm font-semibold text-foreground" numberOfLines={1}>
                      {rewrittenUrl}
                    </Text>
                    <Text className="mt-1 text-xs text-muted" numberOfLines={1}>
                      {server.processName ?? "unknown process"}
                      {server.pid ? ` · pid ${server.pid}` : ""}
                    </Text>
                    {rewrittenUrl !== server.url ? (
                      <Text className="mt-1 font-mono text-[10px] text-muted" numberOfLines={1}>
                        Remote: {server.url}
                      </Text>
                    ) : null}
                  </View>
                  <AppIcon name="globe" size={18} color="#f97316" />
                </View>
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </View>
  );
});