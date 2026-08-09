import {
  parseResumeProfileSnapshot,
  serializeResumeProfileSnapshot,
} from "../../shared/tailoring";
import type { ResumeProfile } from "../../shared/resume-profile";

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function createResumeProfileSnapshot(
  profile: ResumeProfile,
): Promise<{ json: string; hash: string }> {
  const json = serializeResumeProfileSnapshot(profile);
  return { json, hash: await sha256(json) };
}

export async function loadResumeProfileSnapshot(
  json: string | null,
  expectedHash: string | null,
): Promise<ResumeProfile | null> {
  if (!json || !expectedHash || await sha256(json) !== expectedHash) return null;
  return parseResumeProfileSnapshot(json);
}

export async function resumeProfileHasChanged(
  profile: ResumeProfile,
  frozenHash: string,
): Promise<boolean> {
  const current = await createResumeProfileSnapshot(profile);
  return current.hash !== frozenHash;
}
