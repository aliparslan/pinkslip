import type { ApiClient, ResumeImportResult } from "@pinkslip/core/api";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { useSyncExternalStore } from "react";
import { storage } from "./storage";

/** The resume PDF kept on this iPhone: imported once, attached to
 * applications later, never uploaded except to parse it. */
export interface LocalResumeFile { uri: string; name: string; size: number; savedAt: string }

const KEY = "resume-file";
const listeners = new Set<() => void>();
let cached: LocalResumeFile | null | undefined;

function read(): LocalResumeFile | null {
  if (cached !== undefined) return cached;
  try {
    const parsed = JSON.parse(storage.getString(KEY) ?? "null") as LocalResumeFile | null;
    cached = parsed && new File(parsed.uri).exists ? parsed : null;
  } catch {
    cached = null;
  }
  return cached;
}

function write(next: LocalResumeFile | null) {
  cached = next;
  if (next) storage.set(KEY, JSON.stringify(next));
  else storage.remove(KEY);
  for (const listener of listeners) listener();
}

export const localResumeFile = read;

export function useLocalResumeFile(): LocalResumeFile | null {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, read);
}

/** The system document picker, PDFs only. Null when cancelled. */
export async function pickPdf(): Promise<{ uri: string; name: string; size: number } | null> {
  const picked = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
  const asset = picked.canceled ? null : picked.assets?.[0];
  return asset ? { uri: asset.uri, name: asset.name, size: asset.size ?? new File(asset.uri).size } : null;
}

/** Copies a picked PDF into the app's documents as the kept resume file. */
export async function keepResumeFile(source: { uri: string; name: string }): Promise<LocalResumeFile> {
  const target = new File(Paths.document, "resume.pdf");
  if (target.exists) target.delete();
  await new File(source.uri).copy(target);
  const kept = { uri: target.uri, name: source.name, size: target.size, savedAt: new Date().toISOString() };
  write(kept);
  return kept;
}

/** Server parse (D10): Expo's fetch takes expo-file-system's File as a Blob
 * part; a `{ uri, name, type }` part fails. */
export function parseResumeFile(api: ApiClient, uri: string): Promise<ResumeImportResult> {
  return api.resumeImport.parse(new File(uri));
}

/** Removes the kept file (Clear, sign-out, account deletion). */
export function clearResumeFile() {
  const current = read();
  if (current) {
    const file = new File(current.uri);
    if (file.exists) file.delete();
  }
  write(null);
}
