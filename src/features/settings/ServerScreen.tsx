import { EnvironmentId } from "@t3tools/contracts";
import { CameraView, useCameraPermissions } from "expo-camera";
import Constants, { ExecutionEnvironment } from "expo-constants";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppIcon } from "@/components/AppIcon";
import { bottomChromePaddingBottom } from "@/utils/bottomChrome";
import { Screen } from "@/components/Screen";
import { SettingsScreenHeader } from "./SettingsComponents";
import { StatusLogPanel } from "@/components/StatusLogPanel";
import {
  extractPairingUrlFromQrPayload,
  normalizeHostInput,
  parsePairingUrl,
} from "@/features/connection/pairing";
import { useEnvironments } from "@/runtime/EnvironmentProvider";
import { loadPairingDraft, savePairingDraft } from "@/runtime/storage";
import { relativeTime } from "@/utils/time";

function connectionTone(state: string, dataSource: string, isDark: boolean) {
  if (state === "ready")
    return {
      label: "Live",
      color: isDark ? "#4ade80" : "#15803d",
      background: isDark ? "#12301f" : "#dcfce7",
    };
  if (dataSource === "http")
    return {
      label: "HTTP sync",
      color: isDark ? "#fbbf24" : "#b45309",
      background: isDark ? "#3a280c" : "#fef3c7",
    };
  if (state === "connecting" || state === "reconnecting")
    return {
      label: "Connecting",
      color: isDark ? "#93c5fd" : "#1d4ed8",
      background: isDark ? "#172554" : "#dbeafe",
    };
  if (dataSource === "cache")
    return {
      label: "Cached",
      color: isDark ? "#d4d4d4" : "#525252",
      background: isDark ? "#282828" : "#e5e5e5",
    };
  return {
    label: "Offline",
    color: isDark ? "#fca5a5" : "#b91c1c",
    background: isDark ? "#3a1717" : "#fee2e2",
  };
}

function connectionStepLabel(step: string): string {
  switch (step) {
    case "checking-server":
      return "Checking server";
    case "validating-session":
      return "Validating session";
    case "opening-websocket":
      return "Opening WebSocket";
    case "syncing-threads":
      return "Syncing threads";
    case "refreshing-http":
      return "Refreshing HTTP data";
    case "ready":
      return "Live sync ready";
    case "http-ready":
      return "HTTP data ready";
    default:
      return "Offline";
  }
}

export function ServerScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const {
    addConnection,
    environments,
    reconnect,
    reloadThreads,
    removeConnection,
    updateConnectionUrl,
  } = useEnvironments();
  const [serverUrl, setServerUrl] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerLocked, setScannerLocked] = useState(false);
  const [urlDraftByEnvironment, setUrlDraftByEnvironment] = useState<
    Readonly<Record<string, string>>
  >({});
  const [savingEnvironmentId, setSavingEnvironmentId] = useState<string | null>(null);
  const [saveErrorByEnvironment, setSaveErrorByEnvironment] = useState<
    Readonly<Record<string, string>>
  >({});
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const scrollRef = useRef<ScrollView>(null);
  const palette = isDark
    ? { background: "#090909", surface: "#171717", input: "#101010", border: "#303030" }
    : { background: "#f4f4f5", surface: "#ffffff", input: "#f8f8f9", border: "#dedee2" };
  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const usesPlainHttp =
    (serverUrl.trim() ? normalizeHostInput(serverUrl).startsWith("http://") : false) ||
    environments.some((environment) => environment.connection.httpBaseUrl.startsWith("http://"));

  useEffect(() => {
    void loadPairingDraft()
      .then((draft) => {
        setServerUrl(draft.serverUrl);
        setPairingCode(draft.pairingCode);
      })
      .finally(() => setIsLoadingDraft(false));
  }, []);

  useEffect(() => {
    setUrlDraftByEnvironment((current) => {
      const next = { ...current };
      for (const environment of environments) {
        next[environment.connection.environmentId] ??= environment.connection.httpBaseUrl;
      }
      return next;
    });
  }, [environments]);

  const connect = useCallback(
    async (scannedPairingUrl?: string) => {
      const url = scannedPairingUrl ?? serverUrl.trim();
      const code = pairingCode.trim();
      if (!url || isConnecting) return;

      setIsConnecting(true);
      setError(null);
      try {
        await savePairingDraft({ serverUrl: url, pairingCode: code });
        if (scannedPairingUrl || url.includes("token=") || url.includes("#")) {
          await addConnection({ pairingUrl: normalizeHostInput(url) });
        } else if (code) {
          await addConnection({ host: normalizeHostInput(url), pairingCode: code });
        } else {
          await addConnection({ pairingUrl: normalizeHostInput(url) });
        }

        const parsed = parsePairingUrl(url);
        const retainedServerUrl = parsed.host || url;
        setServerUrl(retainedServerUrl);
        setPairingCode("");
        await savePairingDraft({ serverUrl: retainedServerUrl, pairingCode: "" });
        setShowScanner(false);
      } catch (connectError) {
        setError(
          connectError instanceof Error
            ? connectError.message
            : "Unable to pair with the environment."
        );
      } finally {
        setIsConnecting(false);
      }
    },
    [addConnection, isConnecting, pairingCode, serverUrl]
  );

  const openScanner = useCallback(async () => {
    if (cameraPermission?.granted) {
      setScannerLocked(false);
      setShowScanner(true);
      return;
    }
    const permission = await requestCameraPermission();
    if (permission.granted) {
      setScannerLocked(false);
      setShowScanner(true);
      return;
    }
    Alert.alert("Camera access needed", "Allow camera access to scan a T3 Code pairing QR code.");
  }, [cameraPermission?.granted, requestCameraPermission]);

  const handleQrScan = useCallback(
    ({ data }: { readonly data: string }) => {
      if (scannerLocked) return;
      setScannerLocked(true);
      try {
        const pairingUrl = extractPairingUrlFromQrPayload(data);
        const { host, code } = parsePairingUrl(pairingUrl);
        setServerUrl(host || pairingUrl);
        setPairingCode(code);
        void connect(pairingUrl);
      } catch (scanError) {
        Alert.alert(
          "Invalid QR code",
          scanError instanceof Error ? scanError.message : "The QR code was not recognized."
        );
      } finally {
        setTimeout(() => setScannerLocked(false), 600);
      }
    },
    [connect, scannerLocked]
  );

  const confirmRemove = (environmentId: EnvironmentId, label: string) => {
    Alert.alert("Remove server?", `Forget ${label} and its cached threads on this device?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => void removeConnection(environmentId),
      },
    ]);
  };

  const saveConnectionUrl = useCallback(
    async (environmentId: EnvironmentId) => {
      const rawUrl = urlDraftByEnvironment[environmentId]?.trim() ?? "";
      if (!rawUrl || savingEnvironmentId) return;
      setSavingEnvironmentId(environmentId);
      setSaveErrorByEnvironment((current) => ({ ...current, [environmentId]: "" }));
      try {
        await updateConnectionUrl(environmentId, rawUrl);
      } catch (saveError) {
        setSaveErrorByEnvironment((current) => ({
          ...current,
          [environmentId]:
            saveError instanceof Error ? saveError.message : "Unable to save the connection URL.",
        }));
      } finally {
        setSavingEnvironmentId(null);
      }
    },
    [savingEnvironmentId, updateConnectionUrl, urlDraftByEnvironment]
  );

  return (
    <Screen edges={["top", "left", "right"]}>
      <SettingsScreenHeader
        title="Server"
        subtitle="Pair, sync, and inspect server connections"
        action={
          environments.length > 0 ? (
            <Pressable
              onPress={() => void reloadThreads()}
              className="h-10 w-10 items-center justify-center rounded-full border border-border bg-surface"
            >
              <AppIcon name="refresh" size={19} color={isDark ? "#f5f5f5" : "#262626"} />
            </Pressable>
          ) : null
        }
      />

      <ScrollView
        ref={scrollRef}
        className="flex-1"
        style={{ flex: 1, backgroundColor: palette.background }}
        contentContainerStyle={{
          flexGrow: 1,
          gap: 16,
          paddingHorizontal: 12,
          paddingBottom: bottomChromePaddingBottom(insets) + 16,
          paddingTop: 8,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View
          collapsable={false}
          className="gap-4 rounded-[20px] border border-border bg-surface p-4"
          style={{ backgroundColor: palette.surface, borderColor: palette.border }}
        >
          <View>
            <Text className="text-sm font-bold text-foreground">Add a server</Text>
            <Text className="mt-1 text-xs leading-5 text-muted">
              Paste the full pairing link, or enter the Tailscale address and pairing code.
            </Text>
          </View>

          <View className="gap-2">
            <Text className="text-[12px] font-bold uppercase tracking-[0.6px] text-muted">
              Server or pairing URL
            </Text>
            {isLoadingDraft ? (
              <ActivityIndicator style={{ paddingVertical: 14 }} color="#f97316" />
            ) : (
              <TextInput
                value={serverUrl}
                onChangeText={setServerUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder="100.100.10.20:3773 or full pairing link"
                placeholderTextColor={isDark ? "#737373" : "#9a9a9a"}
                className="min-h-11 rounded-2xl border border-border bg-background px-3 py-2.5 text-[14px] text-foreground"
                style={{
                  minHeight: 46,
                  backgroundColor: palette.input,
                  borderColor: palette.border,
                  color: isDark ? "#f5f5f5" : "#171717",
                }}
              />
            )}
          </View>

          <View className="gap-2">
            <Text className="text-[12px] font-bold uppercase tracking-[0.6px] text-muted">
              Pairing code
            </Text>
            <TextInput
              value={pairingCode}
              onChangeText={setPairingCode}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Optional when included in the URL"
              placeholderTextColor={isDark ? "#737373" : "#9a9a9a"}
              className="min-h-11 rounded-2xl border border-border bg-background px-3 py-2.5 text-[14px] text-foreground"
              style={{
                minHeight: 46,
                backgroundColor: palette.input,
                borderColor: palette.border,
                color: isDark ? "#f5f5f5" : "#171717",
              }}
            />
          </View>

          {isExpoGo && usesPlainHttp ? (
            <View className="rounded-2xl bg-warning-soft px-3 py-2.5">
              <Text className="text-sm leading-5 text-warning">
                Expo Go may block plain HTTP tailnet servers. Install this project&apos;s Android or
                iOS development build before testing the connection.
              </Text>
            </View>
          ) : null}

          {error ? (
            <View className="rounded-2xl bg-danger-soft px-3 py-2.5">
              <Text className="text-sm leading-5 text-danger">{error}</Text>
            </View>
          ) : null}

          <View className="flex-row gap-2">
            <Pressable
              disabled={isConnecting || isLoadingDraft || !serverUrl.trim()}
              onPress={() => void connect()}
              className={`h-12 flex-1 items-center justify-center rounded-full ${
                isConnecting || isLoadingDraft || !serverUrl.trim() ? "bg-default" : "bg-accent"
              }`}
            >
              <Text
                className={`font-semibold ${
                  isConnecting || isLoadingDraft || !serverUrl.trim()
                    ? "text-muted"
                    : "text-accent-foreground"
                }`}
              >
                {isConnecting ? "Pairing..." : "Pair & connect"}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (showScanner) setShowScanner(false);
                else void openScanner();
              }}
              className="h-12 items-center justify-center rounded-full border border-border bg-default px-5"
            >
              <Text className="font-semibold text-foreground">
                {showScanner ? "Hide" : "Scan QR"}
              </Text>
            </Pressable>
          </View>

          {showScanner ? (
            <View className="overflow-hidden rounded-2xl">
              {cameraPermission?.granted ? (
                <CameraView
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={handleQrScan}
                  style={{ aspectRatio: 1, width: "100%" }}
                />
              ) : (
                <Pressable onPress={() => void openScanner()} className="bg-default px-4 py-8">
                  <Text className="text-center font-semibold text-foreground">
                    Allow camera access
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}
        </View>

        {environments.length > 0 ? (
          <View className="gap-3">
            <Text className="px-1 text-xs font-bold uppercase tracking-[0.8px] text-muted">
              Saved servers
            </Text>
            {environments.map((environment) => {
              const tone = connectionTone(
                environment.connectionState,
                environment.dataSource,
                isDark
              );
              return (
                <View
                  key={environment.connection.environmentId}
                  className="gap-3 rounded-[20px] border border-border bg-surface p-4"
                  style={{ backgroundColor: palette.surface, borderColor: palette.border }}
                >
                  <View className="flex-row items-start gap-3">
                    <View className="h-11 w-11 items-center justify-center rounded-2xl bg-default">
                      <AppIcon name="terminal" size={21} color={tone.color} />
                    </View>
                    <View className="flex-1">
                      <Text className="text-sm font-bold text-foreground">
                        {environment.connection.label}
                      </Text>
                      <Text className="mt-0.5 text-xs text-muted" numberOfLines={1}>
                        {environment.connection.httpBaseUrl}
                      </Text>
                    </View>
                    <View
                      className="rounded-full px-2.5 py-1"
                      style={{ backgroundColor: tone.background }}
                    >
                      <Text className="text-[11px] font-semibold" style={{ color: tone.color }}>
                        {tone.label}
                      </Text>
                    </View>
                  </View>

                  <View className="flex-row gap-4">
                    <Text className="text-xs text-muted">
                      {environment.snapshot?.threads.filter((thread) => thread.archivedAt == null)
                        .length ?? 0}{" "}
                      threads
                    </Text>
                    <Text className="text-xs text-muted">
                      {environment.snapshot?.projects.length ?? 0} projects
                    </Text>
                    {environment.lastSyncedAt ? (
                      <Text className="text-xs text-muted">
                        synced {relativeTime(environment.lastSyncedAt)}
                      </Text>
                    ) : null}
                  </View>

                  <View className="gap-2">
                    <Text className="text-[12px] font-bold uppercase tracking-[0.6px] text-muted">
                      Connection URL
                    </Text>
                    <TextInput
                      value={
                        urlDraftByEnvironment[environment.connection.environmentId] ??
                        environment.connection.httpBaseUrl
                      }
                      onChangeText={(value) =>
                        setUrlDraftByEnvironment((current) => ({
                          ...current,
                          [environment.connection.environmentId]: value,
                        }))
                      }
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="url"
                      placeholder="100.100.10.20:3773"
                      placeholderTextColor={isDark ? "#737373" : "#9a9a9a"}
                      className="rounded-2xl border border-border px-3 py-2.5 text-[14px] text-foreground"
                      style={{
                        minHeight: 46,
                        backgroundColor: palette.input,
                        borderColor: palette.border,
                        color: isDark ? "#f5f5f5" : "#171717",
                      }}
                    />
                    <Text className="text-xs text-muted">
                      {connectionStepLabel(environment.connectionStep)}
                    </Text>
                    {saveErrorByEnvironment[environment.connection.environmentId] ? (
                      <Text className="text-xs leading-5 text-danger">
                        {saveErrorByEnvironment[environment.connection.environmentId]}
                      </Text>
                    ) : null}
                    <Pressable
                      disabled={
                        savingEnvironmentId !== null ||
                        !(
                          urlDraftByEnvironment[environment.connection.environmentId] ??
                          environment.connection.httpBaseUrl
                        ).trim()
                      }
                      onPress={() => void saveConnectionUrl(environment.connection.environmentId)}
                      className={`h-12 items-center justify-center rounded-full ${
                        savingEnvironmentId === environment.connection.environmentId
                          ? "bg-default"
                          : "bg-accent"
                      }`}
                    >
                      <Text
                        className={`font-semibold ${
                          savingEnvironmentId === environment.connection.environmentId
                            ? "text-muted"
                            : "text-accent-foreground"
                        }`}
                      >
                        {savingEnvironmentId === environment.connection.environmentId
                          ? "Saving..."
                          : "Save connection"}
                      </Text>
                    </Pressable>
                  </View>

                  {environment.error ? (
                    <Text className="text-xs leading-5 text-warning">{environment.error}</Text>
                  ) : null}

                  <View className="flex-row gap-2">
                    <Pressable
                      onPress={() => {
                        setServerUrl(environment.connection.httpBaseUrl);
                        setPairingCode("");
                        setError(null);
                        requestAnimationFrame(() =>
                          scrollRef.current?.scrollTo({ y: 0, animated: true })
                        );
                      }}
                      className="flex-1 items-center rounded-full bg-accent px-4 py-2.5"
                    >
                      <Text className="text-sm font-semibold text-accent-foreground">Re-pair</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void reconnect(environment.connection.environmentId)}
                      className="items-center rounded-full bg-default px-4 py-2.5"
                    >
                      <Text className="text-sm font-semibold text-foreground">Reconnect</Text>
                    </Pressable>
                    <Pressable
                      onPress={() =>
                        confirmRemove(
                          environment.connection.environmentId,
                          environment.connection.label
                        )
                      }
                      className="items-center rounded-full bg-danger-soft px-4 py-2.5"
                    >
                      <Text className="text-sm font-semibold text-danger">Remove</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        <StatusLogPanel />
      </ScrollView>
    </Screen>
  );
}
