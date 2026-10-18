import { base64urlDecode, base64urlEncode } from "./crypto";

/*
 * Passwords are kept only as one-way hashes (Decisions: Accounts #2):
 * PBKDF2-SHA256 with a random salt, through WebCrypto. The iteration count is
 * stored in each hash, so it can change later without breaking old ones.
 */

/**
 * Cloudflare Workers' WebCrypto refuses PBKDF2 above 100,000 iterations
 * ("iteration counts above 100000 are not supported"), so this is the most
 * it can be here. Bun has no such cap, so a test holds it under the limit.
 */
export const WORKERS_PBKDF2_MAX_ITERATIONS = 100_000;
export const PASSWORD_ITERATIONS = WORKERS_PBKDF2_MAX_ITERATIONS;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    key,
    256
  );
  return new Uint8Array(bits);
}

/** Why a password won't do, or null when it will. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters`;
  if (password.length > PASSWORD_MAX_LENGTH) return `Use at most ${PASSWORD_MAX_LENGTH} characters`;
  return null;
}

export async function hashPassword(password: string, iterations = PASSWORD_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${base64urlEncode(salt)}$${base64urlEncode(hash)}`;
}

/** Compares in constant time, so the answer's timing says nothing. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const [scheme, rounds, salt, expected] = (stored ?? "").split("$");
  const iterations = Number(rounds);
  if (scheme !== "pbkdf2-sha256" || !Number.isInteger(iterations) || iterations < 1
    || iterations > WORKERS_PBKDF2_MAX_ITERATIONS || !salt || !expected) return false;
  const actual = await derive(password, base64urlDecode(salt), iterations);
  const wanted = base64urlDecode(expected);
  if (actual.length !== wanted.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index]! ^ wanted[index]!;
  return difference === 0;
}
