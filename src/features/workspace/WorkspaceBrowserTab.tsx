import type { EnvironmentId } from "@t3tools/contracts";
import { memo, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

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

  useEffect(() => {
    if (!props.live) return;
    workspaceLog("browser", "discover", {
      serverCount: discovered.servers.length,
      scannedAt: discovered.scannedAt,
    });
  }, [discovered.scannedAt, discovered.servers.length, props.live]);

  const openExternal = useCallback(
    async (rawUrl: string) => {
      const url = rewriteLocalDevUrl(rawUrl, remoteHost);
      workspaceLog("browser", "open", { rawUrl, url, remoteHost });
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        workspaceLog("browser", "open:unsupported", { url });
        return;
      }
      await Linking.openURL(url);
    },
    [remoteHost]
  );

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

  return (
    <View className="flex-1 bg-background">
      <View className="border-b border-border px-4 py-3">
        <Text className="text-sm font-semibold text-foreground">Local dev servers</Text>
        <Text className="mt-1 text-xs leading-5 text-muted">
          Opens in your phone browser. Localhost and LAN hosts are rewritten to{" "}
          {remoteHost ?? "your connected server"}.
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
            const externalUrl = rewriteLocalDevUrl(server.url, remoteHost);
            return (
              <Pressable
                key={`${server.host}:${server.port}`}
                accessibilityRole="button"
                onPress={() => void openExternal(server.url)}
                className="rounded-2xl border border-border bg-surface px-4 py-3"
              >
                <View className="flex-row items-center justify-between gap-3">
                  <View className="min-w-0 flex-1">
                    <Text className="font-mono text-sm font-semibold text-foreground" numberOfLines={1}>
                      {externalUrl}
                    </Text>
                    <Text className="mt-1 text-xs text-muted" numberOfLines={1}>
                      {server.processName ?? "unknown process"}
                      {server.pid ? ` · pid ${server.pid}` : ""}
                    </Text>
                    {externalUrl !== server.url ? (
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