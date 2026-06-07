import { describe, it, expect, beforeAll, afterEach, mock, spyOn } from "bun:test";
import {
  buildApnsBody,
  buildApnsJwt,
  isDeadApnsToken,
  resolveApnsConfig,
  sendApnsNotification,
  _resetApnsTokenCache,
} from "@worker/apns";
import { buildNotificationPayload } from "@worker/push";
import type { Env } from "@worker/types";

// Generate a real P-256 private key in PKCS#8 PEM form (the .p8 format Apple
// issues) so buildApnsJwt exercises the actual WebCrypto signing path.
let pemPrivateKey: string;

function toPem(der: ArrayBuffer): string {
  const bytes = new Uint8Array(der);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = btoa(binary).replace(/(.{64})/g, "$1\n");
  return `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`;
}

function base64urlToJson(seg: string): any {
  const b64 = seg.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

beforeAll(async () => {
  const keyPair = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;
  const pkcs8 = (await crypto.subtle.exportKey("pkcs8", keyPair.privateKey)) as ArrayBuffer;
  pemPrivateKey = toPem(pkcs8);
});

const CONFIG = () => ({
  keyId: "ABC1234567",
  teamId: "TEAM999999",
  privateKey: pemPrivateKey,
});

describe("buildApnsJwt", () => {
  afterEach(() => {
    _resetApnsTokenCache();
    mock.restore();
  });

  it("produces a JWT with ES256 + kid header and teamId issuer", async () => {
    const jwt = await buildApnsJwt(CONFIG(), 1_700_000_000_000);
    const [headerSeg, payloadSeg, sig] = jwt.split(".");
    expect(sig).toBeTruthy();

    const header = base64urlToJson(headerSeg);
    expect(header.alg).toBe("ES256");
    expect(header.kid).toBe("ABC1234567");

    const payload = base64urlToJson(payloadSeg);
    expect(payload.iss).toBe("TEAM999999");
    expect(payload.iat).toBe(1_700_000_000); // ms → seconds
  });

  it("caches the token within the TTL and refreshes after it", async () => {
    const t0 = 1_700_000_000_000;
    const first = await buildApnsJwt(CONFIG(), t0);
    const cached = await buildApnsJwt(CONFIG(), t0 + 60_000); // +1 min
    expect(cached).toBe(first);

    const refreshed = await buildApnsJwt(CONFIG(), t0 + 60 * 60 * 1000); // +1 hr
    expect(refreshed).not.toBe(first);
  });
});

describe("buildApnsBody", () => {
  it("maps a NotificationPayload into the aps envelope with top-level url", () => {
    const payload = buildNotificationPayload([
      { company: "Anthropic", title: "SWE", jobId: "abc123" },
    ]);
    const body = JSON.parse(buildApnsBody(payload));
    expect(body.aps.alert.title).toBe("Anthropic");
    expect(body.aps.alert.body).toBe("SWE");
    expect(body.aps.sound).toBe("default");
    expect(body.url).toBe("/jobs/abc123");
    expect(body.job_ids).toEqual(["abc123"]);
  });
});

describe("sendApnsNotification", () => {
  afterEach(() => {
    _resetApnsTokenCache();
    mock.restore();
  });

  it("POSTs to the production host with apns-topic and bearer auth", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 })
    );
    const payload = buildNotificationPayload([
      { company: "Anthropic", title: "SWE", jobId: "x1" },
    ]);

    const result = await sendApnsNotification("DEVICETOKEN123", payload, {
      ...CONFIG(),
      bundleId: "dev.alip.pinkslip",
    });

    expect(result.ok).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.push.apple.com/3/device/DEVICETOKEN123");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers["apns-topic"]).toBe("dev.alip.pinkslip");
    expect(headers["apns-push-type"]).toBe("alert");
    expect(headers.authorization).toMatch(/^bearer /);
  });

  it("targets the sandbox host when sandbox=true", async () => {
    const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 200 })
    );
    const payload = buildNotificationPayload([
      { company: "A", title: "B", jobId: "1" },
    ]);

    await sendApnsNotification("TOK", payload, {
      ...CONFIG(),
      bundleId: "dev.alip.pinkslip",
      sandbox: true,
    });

    const [url] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.sandbox.push.apple.com/3/device/TOK");
  });
});

describe("resolveApnsConfig", () => {
  it("returns null when any required field is missing", () => {
    expect(resolveApnsConfig({} as Env)).toBeNull();
    expect(
      resolveApnsConfig({ APNS_KEY_ID: "k", APNS_TEAM_ID: "t" } as Env)
    ).toBeNull();
  });

  it("builds config and reads the sandbox flag", () => {
    const cfg = resolveApnsConfig({
      APNS_KEY_ID: "k",
      APNS_TEAM_ID: "t",
      APNS_BUNDLE_ID: "b",
      APNS_PRIVATE_KEY: "pem",
      APNS_SANDBOX: "true",
    } as Env);
    expect(cfg).toEqual({
      keyId: "k",
      teamId: "t",
      bundleId: "b",
      privateKey: "pem",
      sandbox: true,
    });
  });
});

describe("isDeadApnsToken", () => {
  it("flags 410 and 400 as dead", () => {
    expect(isDeadApnsToken(410)).toBe(true);
    expect(isDeadApnsToken(400)).toBe(true);
    expect(isDeadApnsToken(200)).toBe(false);
    expect(isDeadApnsToken(undefined)).toBe(false);
  });
});
