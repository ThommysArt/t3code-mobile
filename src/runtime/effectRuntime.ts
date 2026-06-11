import { remoteHttpClientLayer } from "@t3tools/client-runtime";
import * as ManagedRuntime from "effect/ManagedRuntime";

export const effectRuntime = ManagedRuntime.make(remoteHttpClientLayer(fetch));
