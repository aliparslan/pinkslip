import { useSyncExternalStore } from "react";
import { storage } from "../../../platform/storage";

/** Outreach settings (Paper O9), kept on this phone until the account
 * holds them: the signature under your emails and what happens after you
 * send one. "Send them for me" comes with Pro. */
export type FollowUps = "remind" | "off";

const SIGNATURE = "outreach.signature";
const FOLLOW_UPS = "outreach.follow-ups";
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };

export function setSignature(value: string) {
  if (value.trim()) storage.set(SIGNATURE, value.trim());
  else storage.remove(SIGNATURE);
  notify();
}

export function setFollowUps(value: FollowUps) {
  storage.set(FOLLOW_UPS, value);
  notify();
}

export function signatureSetting(): string {
  return storage.getString(SIGNATURE) ?? "";
}

export function followUpsSetting(): FollowUps {
  return storage.getString(FOLLOW_UPS) === "off" ? "off" : "remind";
}

let snapshot = { signature: "", followUps: "remind" as FollowUps };
function read() {
  const next = { signature: storage.getString(SIGNATURE) ?? "", followUps: followUpsSetting() };
  if (next.signature !== snapshot.signature || next.followUps !== snapshot.followUps) snapshot = next;
  return snapshot;
}

export function useOutreachPrefs() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, read);
}
