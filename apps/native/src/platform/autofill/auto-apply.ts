import type { ApiClient } from "@pinkslip/core/api";
import { File } from "expo-file-system";
import { localResumeFile } from "../resume-file";
import { runAutoApply, type ApplicationBrowserSession, type AutoApplyOptions, type ResumeUpload } from "./auto-apply-loop";

export type { ApplicationBrowserSession, AutoApplyResult } from "./auto-apply-loop";

async function resumeForUpload(): Promise<ResumeUpload | null> {
  const kept = localResumeFile();
  if (!kept) return null;
  try { return { name: kept.name, base64: await new File(kept.uri).base64() }; } catch { return null; }
}

/** File access stays in the native adapter; the page/session loop is tested
 * independently of Expo and the Keychain-backed account. */
export function autoApply(api: ApiClient, browser: ApplicationBrowserSession, options: AutoApplyOptions) {
  return runAutoApply(api, browser, options, resumeForUpload);
}
