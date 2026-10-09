import type { ApiClient, ResumeImportResult } from "@pinkslip/core/api";
import { Asset } from "expo-asset";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";

export interface LocalResumeFile {
  uri: string;
  name: string;
  type: string;
  size: number;
}

const FIXTURES = {
  text: require("../assets/fixtures/resume-text.pdf"),
  notext: require("../assets/fixtures/resume-notext.pdf"),
  malformed: require("../assets/fixtures/resume-malformed.pdf"),
} as const;

export type ResumeFixture = keyof typeof FIXTURES;

/** Copy the chosen file into the app's documents so the staged attachment
 * survives the picker's cache and can be deleted explicitly. */
async function preserve(source: { uri: string; name: string; type: string }): Promise<LocalResumeFile> {
  const target = new File(Paths.document, source.name);
  if (target.exists) target.delete();
  await new File(source.uri).copy(target);
  return { uri: target.uri, name: target.name, type: source.type, size: target.size };
}

export async function pickResumeFile(): Promise<LocalResumeFile | null> {
  const picked = await DocumentPicker.getDocumentAsync({
    type: "application/pdf",
    copyToCacheDirectory: true,
  });
  if (picked.canceled) return null;
  const asset = picked.assets?.[0];
  if (!asset) return null;
  return preserve({ uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/pdf" });
}

export async function stageFixture(name: ResumeFixture): Promise<LocalResumeFile> {
  const asset = Asset.fromModule(FIXTURES[name]);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  return preserve({ uri, name: `fixture-${name}.pdf`, type: "application/pdf" });
}

export function importResume(api: ApiClient, file: LocalResumeFile): Promise<ResumeImportResult> {
  // Expo's native fetch accepts a Blob part; expo-file-system's File implements
  // Blob and keeps the URI/name/type on the instance.
  return api.resumeImport.parse(new File(file.uri));
}

export function deleteResumeFile(file: LocalResumeFile): boolean {
  const target = new File(file.uri);
  if (!target.exists) return false;
  target.delete();
  return true;
}
