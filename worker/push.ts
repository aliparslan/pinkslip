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
function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
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

/**
 * Sends a Web Push notification.
 * Returns true on success (HTTP 200/201), false otherwise.
 */
export async function sendPushNotification(
  subscription: PushSubscription,
  payload: NotificationPayload,
  vapid: VapidConfig
): Promise<boolean> {
  try {
    const authHeader = await buildVapidHeader(subscription.endpoint, vapid);

    const body = JSON.stringify(payload);

    const response = await fetch(subscription.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
        TTL: "86400",
      },
      body,
    });

    return response.ok;
  } catch {
    return false;
  }
}
