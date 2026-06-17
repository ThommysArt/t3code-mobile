import * as Crypto from "expo-crypto";

export function randomHex(byteLength: number): string {
  const bytes = Crypto.getRandomBytes(byteLength);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}