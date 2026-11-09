import { useSyncExternalStore } from "react";
import { faceFromSeed, parseFace, type FaceSpec } from "../../../ui/face-parts";
import { storage } from "../../../platform/storage";

/** Your face, kept on this phone like your swipe actions, one per account. */
const key = (owner: string) => `you-face:${owner}`;
const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | undefined; value: FaceSpec }>();

function read(owner: string): FaceSpec {
  const raw = storage.getString(key(owner));
  const cached = cache.get(owner);
  if (cached && cached.raw === raw) return cached.value;
  const value = parseFace(raw, faceFromSeed(owner));
  cache.set(owner, { raw, value });
  return value;
}

/** Whose face it is: the account's email, or its name, or a guest. */
export function faceOwner(email: string | null | undefined, name?: string | null): string {
  return (email || name || "guest").toLowerCase();
}

export function useFace(owner: string): FaceSpec {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => read(owner));
}

export function setFace(owner: string, face: FaceSpec) {
  storage.set(key(owner), JSON.stringify(face));
  for (const listener of listeners) listener();
}
