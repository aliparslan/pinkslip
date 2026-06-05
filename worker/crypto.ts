function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function base64urlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64urlDecode(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function decodeBase64DataUrl(dataUrl: string): {
  mimeType: string;
  bytes: Uint8Array;
} {
  const match = dataUrl.match(/^data:([^;,]+)?;base64,(.+)$/);
  if (!match) {
    throw new Error("Expected a base64 data URL");
  }

  return {
    mimeType: match[1] || "application/octet-stream",
    bytes: base64urlDecode(
      match[2].replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
    ),
  };
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToHex(new Uint8Array(digest));
}

export function randomOpaqueToken(byteLength = 32): string {
  return base64urlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}
