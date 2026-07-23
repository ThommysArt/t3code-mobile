import {
  bootstrapRemoteBearerSession,
  fetchRemoteEnvironmentDescriptor,
} from "@t3tools/client-runtime";
import type { AuthClientPresentationMetadata, EnvironmentId } from "@t3tools/contracts";
import { resolveRemotePairingTarget, stripPairingTokenFromUrl } from "@t3tools/shared/remote";
import * as Effect from "effect/Effect";
import { Platform } from "react-native";

import { normalizeHostInput, normalizeHttpBaseUrl, normalizeWsBaseUrl } from "@/utils/network";

import { effectRuntime } from "./effectRuntime";
import { logStatus } from "./statusLog";

export interface SavedConnection {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly displayUrl: string;
  readonly httpBaseUrl: string;
  readonly wsBaseUrl: string;
  readonly bearerToken: string;
}

function clientMetadata(): AuthClientPresentationMetadata {
  return {
    label: "T3 Code Minimal",
    deviceType: "mobile",
    ...(Platform.OS === "ios" ? { os: "iOS" } : Platform.OS === "android" ? { os: "Android" } : {}),
  };
}

export interface ConnectionInput {
  readonly pairingUrl?: string;
  readonly host?: string;
  readonly pairingCode?: string;
}

export function normalizeSavedConnection(connection: SavedConnection): SavedConnection {
  return {
    ...connection,
    httpBaseUrl: normalizeHttpBaseUrl(connection.httpBaseUrl),
    wsBaseUrl: normalizeWsBaseUrl(connection.wsBaseUrl),
  };
}

function normalizeConnectionInput(input: ConnectionInput): ConnectionInput {
  const host = input.host?.trim() ?? "";
  return {
    pairingUrl: input.pairingUrl,
    pairingCode: input.pairingCode,
    ...(host ? { host: normalizeHostInput(host) } : {}),
  };
}

export async function bootstrapConnection(input: ConnectionInput): Promise<SavedConnection> {
  logStatus("environment", "info", "Bootstrapping connection", "Resolving pairing target", {
    toast: false,
  });
  const target = resolveRemotePairingTarget(normalizeConnectionInput(input));
  const httpBaseUrl = normalizeHttpBaseUrl(target.httpBaseUrl);
  const wsBaseUrl = normalizeWsBaseUrl(target.wsBaseUrl);
  const { descriptor, session } = await effectRuntime.runPromise(
    Effect.all(
      {
        descriptor: fetchRemoteEnvironmentDescriptor({
          httpBaseUrl,
        }),
        session: bootstrapRemoteBearerSession({
          httpBaseUrl,
          credential: target.credential,
          clientMetadata: clientMetadata(),
        }),
      },
      { concurrency: "unbounded" }
    )
  );

  const pairingUrl = input.pairingUrl?.trim() ?? "";
  const displayUrl =
    pairingUrl.length > 0 ? stripPairingTokenFromUrl(new URL(pairingUrl)).toString() : httpBaseUrl;
  const savedConnection: SavedConnection = normalizeSavedConnection({
    environmentId: descriptor.environmentId,
    label: descriptor.label,
    displayUrl,
    httpBaseUrl,
    wsBaseUrl,
    bearerToken: session.access_token,
  });
  logStatus(
    "environment",
    "success",
    "Connection bootstrapped",
    `${savedConnection.label} (${savedConnection.displayUrl})`,
    { environmentId: savedConnection.environmentId, toast: false }
  );
  return savedConnection;
}
