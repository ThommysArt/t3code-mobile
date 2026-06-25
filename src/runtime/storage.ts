import { normalizeSavedConnection, type SavedConnection } from "./connection";
import { getSecureItem, setSecureItem } from "./secureStorage";

const CONNECTIONS_KEY = "t3code.minimal.connections";
const PAIRING_DRAFT_KEY = "t3code.minimal.pairing-draft";

export interface PairingDraft {
  readonly serverUrl: string;
  readonly pairingCode: string;
}

export async function loadPairingDraft(): Promise<PairingDraft> {
  const raw = await getSecureItem(PAIRING_DRAFT_KEY);
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
  await setSecureItem(PAIRING_DRAFT_KEY, JSON.stringify(draft));
}

export async function loadConnections(): Promise<readonly SavedConnection[]> {
  const raw = await getSecureItem(CONNECTIONS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as { readonly connections?: readonly SavedConnection[] };
    return (parsed.connections ?? [])
      .filter(
        (connection) =>
          Boolean(connection.environmentId) &&
          Boolean(connection.httpBaseUrl) &&
          Boolean(connection.bearerToken)
      )
      .map(normalizeSavedConnection);
  } catch {
    return [];
  }
}

export async function saveConnections(connections: readonly SavedConnection[]): Promise<void> {
  await setSecureItem(CONNECTIONS_KEY, JSON.stringify({ connections }));
}
