import { CameraView, useCameraPermissions } from "expo-camera";
import { EnvironmentId } from "@t3tools/contracts";
import { useRouter } from "expo-router";
import { Button, Card, Chip, Input } from "heroui-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import {
  extractPairingUrlFromQrPayload,
  normalizeHostInput,
  parsePairingUrl,
} from "@/features/connection/pairing";
import { useEnvironments } from "@/runtime/EnvironmentProvider";
import { loadPairingDraft, savePairingDraft } from "@/runtime/storage";

export default function ConnectionsScreen() {
  const router = useRouter();
  const { addConnection, environments, reconnect, removeConnection } = useEnvironments();
  const [serverUrl, setServerUrl] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [isLoadingDraft, setIsLoadingDraft] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerLocked, setScannerLocked] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  useEffect(() => {
    void loadPairingDraft()
      .then((draft) => {
        setServerUrl(draft.serverUrl);
        setPairingCode(draft.pairingCode);
      })
      .finally(() => setIsLoadingDraft(false));
  }, []);

  const connect = useCallback(
    async (scannedPairingUrl?: string) => {
      const url = scannedPairingUrl ?? serverUrl.trim();
      const code = pairingCode.trim();
      if (!url || isConnecting) return;

      setIsConnecting(true);
      setError(null);
      try {
        await savePairingDraft({ serverUrl: url, pairingCode: code });
        setServerUrl(url);
        setPairingCode(code);

        if (scannedPairingUrl || url.includes("token=") || url.includes("#")) {
          await addConnection({ pairingUrl: normalizeHostInput(url) });
        } else if (code) {
          await addConnection({ host: normalizeHostInput(url), pairingCode: code });
        } else {
          await addConnection({ pairingUrl: normalizeHostInput(url) });
        }
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

    Alert.alert(
      "Camera access needed",
      "Allow camera access to scan an environment pairing QR code."
    );
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
          scanError instanceof Error ? scanError.message : "Scanned QR code was not recognized."
        );
      } finally {
        setTimeout(() => setScannerLocked(false), 600);
      }
    },
    [connect, scannerLocked]
  );

  const confirmRemove = (environmentId: EnvironmentId, label: string) => {
    Alert.alert("Remove environment?", `Forget ${label} on this device?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => void removeConnection(environmentId),
      },
    ]);
  };

  const saveDisabled = isConnecting || isLoadingDraft || serverUrl.trim().length === 0;

  return (
    <Screen>
      <View className="flex-row items-center gap-3 border-b border-divider px-4 pb-3 pt-1">
        <Button size="sm" variant="ghost" onPress={() => router.back()}>
          Back
        </Button>
        <View className="flex-1">
          <Text className="text-lg font-semibold text-foreground">Environments</Text>
          <Text className="text-xs text-muted">
            Enter a server URL or scan a QR code to pair with T3 Code.
          </Text>
        </View>
      </View>

      <View className="gap-3 px-4 pb-3 pt-4">
        <View className="gap-1.5">
          <Text className="text-xs font-semibold uppercase tracking-[1px] text-muted">
            Server URL
          </Text>
          {isLoadingDraft ? (
            <ActivityIndicator style={{ paddingVertical: 12 }} color="#18181b" />
          ) : (
            <Input
              value={serverUrl}
              onChangeText={setServerUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="http://192.168.1.100:8080#token=abc-123"
            />
          )}
        </View>

        <View className="gap-1.5">
          <Text className="text-xs font-semibold uppercase tracking-[1px] text-muted">
            Pairing code (optional)
          </Text>
          <Input
            value={pairingCode}
            onChangeText={setPairingCode}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="abc-123-xyz"
          />
        </View>

        {error ? <Text className="text-sm leading-5 text-danger">{error}</Text> : null}

        <View className="flex-row gap-2">
          <Button className="flex-1" isDisabled={saveDisabled} onPress={() => void connect()}>
            {isConnecting ? "Saving..." : "Save & Connect"}
          </Button>
          <Button
            variant="secondary"
            onPress={() => {
              if (showScanner) setShowScanner(false);
              else void openScanner();
            }}
          >
            {showScanner ? "Hide QR" : "Scan QR"}
          </Button>
        </View>

        {showScanner ? (
          <Card variant="secondary">
            <Card.Body className="gap-3">
              <Card.Description>
                Point your camera at the pairing QR code shown in T3 Code.
              </Card.Description>
              {cameraPermission?.granted ? (
                <View className="overflow-hidden rounded-2xl">
                  <CameraView
                    barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                    onBarcodeScanned={handleQrScan}
                    style={{ aspectRatio: 1, width: "100%" }}
                  />
                </View>
              ) : (
                <Button variant="secondary" onPress={() => void openScanner()}>
                  Allow camera
                </Button>
              )}
            </Card.Body>
          </Card>
        ) : null}
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ gap: 16, paddingHorizontal: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {environments.map((environment) => (
          <Card key={environment.connection.environmentId}>
            <Card.Body className="gap-3">
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Card.Title>{environment.connection.label}</Card.Title>
                  <Card.Description numberOfLines={1}>
                    {environment.connection.httpBaseUrl}
                  </Card.Description>
                </View>
                <Chip
                  size="sm"
                  variant="soft"
                  color={
                    environment.connectionState === "ready"
                      ? "success"
                      : environment.connectionState === "disconnected"
                        ? "danger"
                        : "warning"
                  }
                >
                  {environment.connectionState}
                </Chip>
              </View>
              {environment.error ? (
                <Text className="text-sm leading-5 text-danger">{environment.error}</Text>
              ) : null}
            </Card.Body>
            <Card.Footer className="gap-2">
              <Button
                size="sm"
                variant="secondary"
                onPress={() => void reconnect(environment.connection.environmentId)}
              >
                Reconnect
              </Button>
              <Button
                size="sm"
                variant="danger-soft"
                onPress={() =>
                  confirmRemove(environment.connection.environmentId, environment.connection.label)
                }
              >
                Remove
              </Button>
            </Card.Footer>
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}