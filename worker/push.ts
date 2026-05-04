// ─── Notification Payload ────────────────────────────────────────────────────

export interface NotificationJob {
  company: string;
  title: string;
  jobId: string;
}

export interface NotificationPayload {
  title: string;
  body: string;
  data: { url: string };
}

/**
 * Builds a Web Push notification payload from an array of new job listings.
 *
 * - 1 job:   title = company name, body = job title, url = /jobs/{jobId}
 * - 2–4:     title = "N new jobs", body = company names, url = /
 * - 5+:      title = "N new jobs", body = company names (up to 4) + "and more", url = /
 */
export function buildNotificationPayload(jobs: NotificationJob[]): NotificationPayload {
  const count = jobs.length;

  if (count === 1) {
    return {
      title: jobs[0].company,
      body: jobs[0].title,
      data: { url: `/jobs/${jobs[0].jobId}` },
    };
  }

  const companies = jobs.slice(0, 4).map((j) => j.company);
  const body =
    count >= 5
      ? `${companies.join(", ")} and more`
      : companies.join(", ");

  return {
    title: `${count} new jobs`,
    body,
    data: { url: "/" },
  };
}

// ─── VAPID / Push helpers ────────────────────────────────────────────────────

export interface VapidConfig {
  subject: string;
  publicKey: string;
  privateKey: string;
}

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// Base64url helpers (no padding)
function asUint8Array(buffer: ArrayBuffer | ArrayBufferView): Uint8Array {
  if (buffer instanceof ArrayBuffer) {
    return new Uint8Array(buffer);
  }

  return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

function base64urlEncode(buffer: ArrayBuffer | ArrayBufferView): string {
  const bytes = asUint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function base64urlDecode(str: string): Uint8Array {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (padded.length % 4)) % 4;
  const b64 = padded + "=".repeat(padding);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Builds a VAPID JWT (ES256) using WebCrypto.
 * Returns a string suitable for the Authorization header: "vapid t=...,k=..."
 */
async function buildVapidHeader(
  endpoint: string,
  vapid: VapidConfig
): Promise<string> {
  const endpointUrl = new URL(endpoint);
  const audience = `${endpointUrl.protocol}//${endpointUrl.host}`;

  const header = base64urlEncode(
    new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" }))
  );

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    aud: audience,
    exp: now + 12 * 60 * 60, // 12 hours
    sub: vapid.subject,
  };
  const payload = base64urlEncode(
    new TextEncoder().encode(JSON.stringify(claims))
  );

  const signingInput = `${header}.${payload}`;

  // Import the VAPID private key (raw base64url-encoded 32-byte scalar)
  const rawPrivateKey = base64urlDecode(vapid.privateKey);

  // We need to import as a JWK so we can supply the EC parameters properly.
  // The public key is an uncompressed point (65 bytes starting with 0x04).
  const rawPublicKey = base64urlDecode(vapid.publicKey);
  // rawPublicKey: 0x04 || x (32 bytes) || y (32 bytes)
  const x = base64urlEncode(rawPublicKey.slice(1, 33).buffer as ArrayBuffer);
  const y = base64urlEncode(rawPublicKey.slice(33, 65).buffer as ArrayBuffer);
  const d = base64urlEncode(rawPrivateKey.buffer as ArrayBuffer);

  const jwk = {
    kty: "EC",
    crv: "P-256",
    d,
    x,
    y,
  };

  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );

  const sigBuffer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    cryptoKey,
    new TextEncoder().encode(signingInput)
  );

  const signature = base64urlEncode(sigBuffer);
  const token = `${signingInput}.${signature}`;

  return `vapid t=${token},k=${vapid.publicKey}`;
}

// ─── RFC 8291 Payload Encryption ────────────────────────────────────────────

function concat(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(len);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, data));
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmacSha256(salt, ikm);
  const infoWithCounter = concat(info, new Uint8Array([1]));
  const okm = await hmacSha256(prk, infoWithCounter);
  return okm.slice(0, length);
}

async function encryptPayload(
  plaintext: Uint8Array,
  subscription: PushSubscription
): Promise<Uint8Array> {
  const clientPublicKey = base64urlDecode(subscription.keys.p256dh);
  const clientAuth = base64urlDecode(subscription.keys.auth);

  const serverKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]
  ) as CryptoKeyPair;
  const serverPublicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverKeys.publicKey) as ArrayBuffer
  );

  const clientCryptoKey = await crypto.subtle.importKey(
    "raw", clientPublicKey, { name: "ECDH", namedCurve: "P-256" }, false, []
  );

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientCryptoKey } as any,
      serverKeys.privateKey,
      256
    )
  );

  // RFC 8291 Section 3.3: IKM derivation
  const enc = new TextEncoder();
  const ikmInfo = concat(enc.encode("WebPush: info\0"), clientPublicKey, serverPublicKey);
  const ikm = await hkdf(clientAuth, sharedSecret, ikmInfo, 32);

  // RFC 8188: Content encryption key and nonce
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  // Pad plaintext: content + delimiter (0x02 = final record)
  const padded = concat(plaintext, new Uint8Array([2]));

  const contentKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, contentKey, padded)
  );

  // aes128gcm header: salt(16) || rs(4) || idlen(1) || keyid(65) || ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);

  return concat(salt, rs, new Uint8Array([serverPublicKey.length]), serverPublicKey, encrypted);
}

export interface PushResult {
  ok: boolean;
  status?: number;
  body?: string;
  error?: string;
}

/**
 * Sends a Web Push notification with RFC 8291 encrypted payload.
 */
export async function sendPushNotification(
  subscription: PushSubscription,
  payload: NotificationPayload,
  vapid: VapidConfig
): Promise<PushResult> {
  try {
    const authHeader = await buildVapidHeader(subscription.endpoint, vapid);
    const plaintext = new TextEncoder().encode(JSON.stringify(payload));
    const body = await encryptPayload(plaintext, subscription);

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        "Content-Length": String(body.byteLength),
        TTL: "86400",
      },
      body,
    });

    const responseBody = await response.text();
    return { ok: response.ok, status: response.status, body: responseBody };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
