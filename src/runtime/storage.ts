import * as SecureStore from "expo-secure-store";

import { normalizeSavedConnection, type ConnectionInput, type SavedConnection } from "./connection";

const CONNECTIONS_KEY = "t3code.minimal.connections";
const PAIRING_DRAFT_KEY = "t3code.minimal.pairing-draft";

export interface PairingDraft {
  readonly serverUrl: string;
  readonly pairingCode: string;
}

export async function loadPairingDraft(): Promise<PairingDraft> {
  const raw = await SecureStore.getItemAsync(PAIRING_DRAFT_KEY);
  if (!raw) {
    return { serverUrl: "", pairingCode: "" };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PairingDraft>;
    return {
      serverUrl: parsed.serverUrl ?? "",
      pairingCode: parsed.pairingCode ?? "",
    };
  } catch {
    return { serverUrl: "", pairingCode: "" };
  }
}

export async function savePairingDraft(draft: PairingDraft): Promise<void> {
  await SecureStore.setItemAsync(PAIRING_DRAFT_KEY, JSON.stringify(draft));
}

function pairingInputFromDraft(
  draft: PairingDraft,
  connection: SavedConnection
): ConnectionInput | undefined {
  const serverUrl = draft.serverUrl.trim();
  const pairingCode = draft.pairingCode.trim();
  if (serverUrl && pairingCode) {
    return { host: serverUrl, pairingCode };
  }
  if (serverUrl) {
    return { pairingUrl: serverUrl };
  }
  if (connection.displayUrl.trim()) {
    return { pairingUrl: connection.displayUrl };
  }
  return undefined;
}

export async function loadConnections(): Promise<readonly SavedConnection[]> {
  const raw = await SecureStore.getItemAsync(CONNECTIONS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as { readonly connections?: readonly SavedConnection[] };
    const draft = await loadPairingDraft();
    return (parsed.connections ?? [])
      .filter(
        (connection) =>
          Boolean(connection.environmentId) &&
          Boolean(connection.httpBaseUrl) &&
          Boolean(connection.bearerToken)
      )
      .map((connection) =>
        normalizeSavedConnection({
          ...connection,
          pairingInput: connection.pairingInput ?? pairingInputFromDraft(draft, connection),
        })
      );
  } catch {
    return [];
  }
}

export async function saveConnections(connections: readonly SavedConnection[]): Promise<void> {
  await SecureStore.setItemAsync(CONNECTIONS_KEY, JSON.stringify({ connections }));
}
