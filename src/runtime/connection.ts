import {
  bootstrapRemoteBearerSession,
  fetchRemoteEnvironmentDescriptor,
} from "@t3tools/client-runtime";
import type { AuthClientPresentationMetadata, EnvironmentId } from "@t3tools/contracts";
import { resolveRemotePairingTarget, stripPairingTokenFromUrl } from "@t3tools/shared/remote";
import * as Effect from "effect/Effect";
import { Platform } from "react-native";

import { effectRuntime } from "./effectRuntime";

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

export async function bootstrapConnection(input: ConnectionInput): Promise<SavedConnection> {
  const target = resolveRemotePairingTarget({
    pairingUrl: input.pairingUrl,
    host: input.host,
    pairingCode: input.pairingCode,
  });
  const { descriptor, session } = await effectRuntime.runPromise(
    Effect.all(
      {
        descriptor: fetchRemoteEnvironmentDescriptor({
          httpBaseUrl: target.httpBaseUrl,
        }),
        session: bootstrapRemoteBearerSession({
          httpBaseUrl: target.httpBaseUrl,
          credential: target.credential,
          clientMetadata: clientMetadata(),
        }),
      },
      { concurrency: "unbounded" }
    )
  );

  const pairingUrl = input.pairingUrl?.trim() ?? "";
  const displayUrl =
    pairingUrl.length > 0
      ? stripPairingTokenFromUrl(new URL(pairingUrl)).toString()
      : target.httpBaseUrl;
  return {
    environmentId: descriptor.environmentId,
    label: descriptor.label,
    displayUrl,
    httpBaseUrl: target.httpBaseUrl,
    wsBaseUrl: target.wsBaseUrl,
    bearerToken: session.access_token,
  };
}
