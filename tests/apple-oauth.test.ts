import { beforeAll, describe, expect, test } from "bun:test";
import {
  buildAppleClientSecret,
  decryptAppleRefreshToken,
  encryptAppleRefreshToken,
  exchangeAppleAuthorizationCode,
  resolveAppleServerConfig,
  revokeAppleAuthorizationForUser,
  revokeAppleRefreshToken,
  type AppleServerConfig,
} from "../worker/apple-oauth";
import { base64urlEncode } from "../worker/crypto";
import type { Env } from "../worker/types";

let privateKeyPem = "";

function toPem(der: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(der)) binary += String.fromCharCode(byte);
  const encoded = btoa(binary).replace(/(.{64})/g, "$1\n");
  return `-----BEGIN PRIVATE KEY-----\n${encoded}\n-----END PRIVATE KEY-----`;
}

function jwtJson(segment: string): Record<string, unknown> {
  const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  ) as CryptoKeyPair;
  privateKeyPem = toPem(
    await crypto.subtle.exportKey("pkcs8", pair.privateKey) as ArrayBuffer,
  );
});

function config(): AppleServerConfig {
  return {
    clientId: "dev.alip.pinkslip",
    teamId: "TEAM123456",
    keyId: "KEY1234567",
    privateKey: privateKeyPem,
    encryptionKey: base64urlEncode(Uint8Array.from({ length: 32 }, (_, index) => index)),
  };
}

describe("Sign in with Apple server credentials", () => {
  test("builds the required short-lived ES256 client secret", async () => {
    const token = await buildAppleClientSecret(config(), 1_700_000_000_000);
    const [header, payload, signature] = token.split(".");

    expect(jwtJson(header)).toEqual({ alg: "ES256", kid: "KEY1234567" });
    expect(jwtJson(payload)).toEqual({
      iss: "TEAM123456",
      iat: 1_700_000_000,
      exp: 1_700_000_300,
      aud: "https://appleid.apple.com",
      sub: "dev.alip.pinkslip",
    });
    expect(signature).toBeTruthy();
  });

  test("requires every server and at-rest encryption setting", () => {
    expect(resolveAppleServerConfig({ APPLE_APP_ID: "dev.alip.pinkslip" } as Env)).toBeNull();
    expect(resolveAppleServerConfig({
      APPLE_APP_ID: "dev.alip.pinkslip",
      APPLE_TEAM_ID: "TEAM123456",
      APPLE_SIGN_IN_KEY_ID: "KEY1234567",
      APPLE_SIGN_IN_PRIVATE_KEY: "pem",
      APPLE_TOKEN_ENCRYPTION_KEY: "key",
    } as Env)).toEqual({
      clientId: "dev.alip.pinkslip",
      teamId: "TEAM123456",
      keyId: "KEY1234567",
      privateKey: "pem",
      encryptionKey: "key",
    });
  });

  test("does not touch token storage when server revocation is not configured", async () => {
    const env = {} as Env;
    Object.defineProperty(env, "DB", {
      get() {
        throw new Error("D1 should not be read without complete Apple server configuration");
      },
    });
    expect(await revokeAppleAuthorizationForUser(env, "user-1")).toBe("not_configured");
  });

  test("encrypts refresh tokens with identity-bound AES-GCM", async () => {
    const encrypted = await encryptAppleRefreshToken("refresh-secret", "identity-1", config().encryptionKey);
    expect(encrypted).not.toContain("refresh-secret");
    await expect(decryptAppleRefreshToken(encrypted, "identity-2", config().encryptionKey)).rejects.toThrow();
    expect(await decryptAppleRefreshToken(encrypted, "identity-1", config().encryptionKey)).toBe("refresh-secret");
  });

  test("exchanges a native authorization code using form encoding", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const response = await exchangeAppleAuthorizationCode(config(), "one-time-code", async (url, init) => {
      requests.push({ url: String(url), init });
      return Response.json({
        access_token: "access",
        token_type: "Bearer",
        expires_in: 3600,
        refresh_token: "refresh",
        id_token: "identity",
      });
    });

    expect(response.refresh_token).toBe("refresh");
    expect(requests[0]?.url).toBe("https://appleid.apple.com/auth/token");
    const form = new URLSearchParams(String(requests[0]?.init?.body));
    expect(form.get("client_id")).toBe("dev.alip.pinkslip");
    expect(form.get("code")).toBe("one-time-code");
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("client_secret")?.split(".")).toHaveLength(3);
  });

  test("revokes a refresh token using Apple's revocation endpoint", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    await revokeAppleRefreshToken(config(), "refresh", async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(null, { status: 200 });
    });

    expect(requests[0]?.url).toBe("https://appleid.apple.com/auth/revoke");
    const form = new URLSearchParams(String(requests[0]?.init?.body));
    expect(form.get("token")).toBe("refresh");
    expect(form.get("token_type_hint")).toBe("refresh_token");
  });
});
