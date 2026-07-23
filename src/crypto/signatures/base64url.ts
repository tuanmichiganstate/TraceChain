const BASE64URL = /^[A-Za-z0-9_-]*$/u;

export function decodeBase64Url(value: string): Uint8Array {
  if (!BASE64URL.test(value)) {
    throw new Error("Value is not valid unpadded base64url");
  }
  const paddingLength = (4 - (value.length % 4)) % 4;
  const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/") + "=".repeat(paddingLength);
  const binary = globalThis.atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function encodeBase64Url(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return globalThis
    .btoa(binary)
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/u, "");
}
