import { extractPdfText as extractStructuredPdfText } from "./pdf-extract";

export const DEFAULT_TAILOR_PROVIDER = "gemini";
export const DEFAULT_TAILOR_MODEL = "gemini-3.1-flash-lite";
export const TAILOR_MODEL_OPTIONS = [
  {
    value: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    note: "default",
  },
  {
    value: "gemini-3-flash",
    label: "Gemini 3 Flash",
    note: "quality mode",
  },
  {
    value: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    note: "fallback",
  },
  {
    value: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash Lite",
    note: "fallback",
  },
] as const;

const KIT_KEY = "pinkslip.local-tailor-kit.v1";
const API_KEY_SESSION_KEY = "pinkslip.local-tailor-api-key.v1";
const DRAFTS_KEY = "pinkslip.local-tailor-drafts.v1";
const MAX_RESUME_BYTES = 2 * 1024 * 1024;

export interface LocalResumeAsset {
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  dataUrl: string;
  textContent: string | null;
  textFormat: "plain" | "markdown" | "pdf" | "binary";
  canTailor: boolean;
}

export interface LocalTailorKit {
  provider: typeof DEFAULT_TAILOR_PROVIDER;
  apiKey: string;
  model: string;
  resume: LocalResumeAsset | null;
}

export interface LocalTailorDraft {
  jobId: string;
  resumeText: string;
  coverText: string;
  qaText: string;
  model: string | null;
  updatedAt: string;
  tokenSummary: { input: number; output: number } | null;
}

interface DraftMap {
  [jobId: string]: LocalTailorDraft;
}

function normalizeTailorModel(model: string | undefined) {
  const trimmed = model?.trim() ?? "";
  return TAILOR_MODEL_OPTIONS.some((option) => option.value === trimmed)
    ? trimmed
    : DEFAULT_TAILOR_MODEL;
}

function hasBrowserStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string, fallback: T): T {
  if (!hasBrowserStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (!hasBrowserStorage()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the uploaded file"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the uploaded file"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

async function readDataUrlAsText(dataUrl: string) {
  return dataUrlToBlob(dataUrl).text();
}

function extensionOf(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

export function isTextResumeFile(fileName: string, mimeType = "") {
  const ext = extensionOf(fileName);
  if (ext === "tex") return false;
  if (mimeType.startsWith("text/")) return true;
  return ["txt", "md", "markdown", "rtf"].includes(ext);
}

function isPdfResumeFile(fileName: string, mimeType = "") {
  return mimeType === "application/pdf" || extensionOf(fileName) === "pdf";
}

async function extractPdfText(file: File): Promise<string> {
  const result = await extractStructuredPdfText(file);
  return result.text.trim();
}

function sanitizeLocalResumeAsset(asset: LocalResumeAsset | null | undefined): LocalResumeAsset | null {
  if (!asset) return null;
  if (extensionOf(asset.fileName) === "tex" || (asset as { textFormat?: string }).textFormat === "latex") {
    return null;
  }
  return asset;
}

export async function createLocalResumeAsset(file: File): Promise<LocalResumeAsset> {
  if (file.size > MAX_RESUME_BYTES) {
    throw new Error("Resume uploads are capped at 2 MB for browser-local storage");
  }
  if (extensionOf(file.name) === "tex") {
    throw new Error("TeX uploads are not supported right now. Upload a PDF, markdown, or plain-text resume.");
  }

  const dataUrl = await readAsDataUrl(file);
  let textContent: string | null = null;
  let textFormat: LocalResumeAsset["textFormat"] = "binary";

  if (isTextResumeFile(file.name, file.type)) {
    const rawText = await readAsText(file);
    if (["md", "markdown"].includes(extensionOf(file.name))) {
      textContent = rawText.trim();
      textFormat = "markdown";
    } else {
      textContent = rawText.trim();
      textFormat = "plain";
    }
  } else if (isPdfResumeFile(file.name, file.type)) {
    textFormat = "pdf";
    textContent = await extractPdfText(file).catch(() => null);
  }

  return {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    uploadedAt: new Date().toISOString(),
    dataUrl,
    textContent: textContent?.trim() || null,
    textFormat,
    canTailor: Boolean(textContent?.trim()),
  };
}

export function loadLocalTailorKit(): LocalTailorKit {
  const kit = readJson<Partial<LocalTailorKit>>(KIT_KEY, {});
  const persistedApiKey = typeof kit.apiKey === "string" ? kit.apiKey : "";
  let apiKey = persistedApiKey;
  try {
    apiKey = window.sessionStorage.getItem(API_KEY_SESSION_KEY) ?? persistedApiKey;
    if (persistedApiKey) {
      window.sessionStorage.setItem(API_KEY_SESSION_KEY, persistedApiKey);
      writeJson(KIT_KEY, { ...kit, apiKey: "" });
    }
  } catch {
    // Storage can be disabled; keep the in-memory value for this load.
  }
  return {
    provider: DEFAULT_TAILOR_PROVIDER,
    apiKey,
    model: normalizeTailorModel(kit.model),
    resume: sanitizeLocalResumeAsset(kit.resume),
  };
}

export function saveLocalTailorKit(next: LocalTailorKit) {
  // API keys live only for the current browser session. Persist the resume/model,
  // but never leave the raw provider credential in durable localStorage.
  writeJson(KIT_KEY, { ...next, apiKey: "" });
  try {
    if (next.apiKey) {
      window.sessionStorage.setItem(API_KEY_SESSION_KEY, next.apiKey);
    } else {
      window.sessionStorage.removeItem(API_KEY_SESSION_KEY);
    }
  } catch {
    // The current in-memory UI state still works when browser storage is blocked.
  }
}

export function updateLocalTailorKit(patch: Partial<LocalTailorKit>) {
  const current = loadLocalTailorKit();
  saveLocalTailorKit({
    ...current,
    ...patch,
    provider: DEFAULT_TAILOR_PROVIDER,
    model: normalizeTailorModel(patch.model ?? current.model),
  });
}

export async function refreshLocalResumeAssetText(
  asset: LocalResumeAsset | null
): Promise<LocalResumeAsset | null> {
  if (!asset) {
    return asset;
  }

  if (extensionOf(asset.fileName) === "tex" || (asset as { textFormat?: string }).textFormat === "latex") {
    return null;
  }

  if (isTextResumeFile(asset.fileName, asset.mimeType) && !asset.textContent) {
    const rawText = await readDataUrlAsText(asset.dataUrl).catch(() => null);
    if (!rawText?.trim()) return asset;

    const ext = extensionOf(asset.fileName);
    const textFormat: LocalResumeAsset["textFormat"] =
      ["md", "markdown"].includes(ext) ? "markdown" : "plain";
    const textContent = rawText.trim();

    return {
      ...asset,
      textContent: textContent?.trim() || null,
      textFormat,
      canTailor: Boolean(textContent?.trim()),
    };
  }

  if (asset.canTailor || !isPdfResumeFile(asset.fileName, asset.mimeType)) {
    return asset;
  }

  const blob = dataUrlToBlob(asset.dataUrl);
  const file = new File([blob], asset.fileName, {
    type: asset.mimeType || blob.type || "application/pdf",
  });
  const textContent = await extractPdfText(file).catch(() => null);

  return {
    ...asset,
    mimeType: asset.mimeType || blob.type || "application/pdf",
    textContent: textContent?.trim() || null,
    textFormat: "pdf",
    canTailor: Boolean(textContent?.trim()),
  };
}

export async function refreshLocalTailorKitResume(): Promise<LocalTailorKit> {
  const current = loadLocalTailorKit();
  const refreshedResume = await refreshLocalResumeAssetText(current.resume);
  if (refreshedResume === current.resume) return current;

  const next = {
    ...current,
    resume: refreshedResume,
  };
  saveLocalTailorKit(next);
  return next;
}

function loadDraftMap() {
  return readJson<DraftMap>(DRAFTS_KEY, {});
}

function saveDraftMap(next: DraftMap) {
  writeJson(DRAFTS_KEY, next);
}

export function loadLocalTailorDraft(jobId: string) {
  const drafts = loadDraftMap();
  return drafts[jobId] ?? null;
}

export function saveLocalTailorDraft(draft: LocalTailorDraft) {
  const drafts = loadDraftMap();
  drafts[draft.jobId] = draft;
  const entries = Object.values(drafts)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 30);
  const trimmed: DraftMap = {};
  for (const entry of entries) trimmed[entry.jobId] = entry;
  saveDraftMap(trimmed);
}

export function getLocalResumeTailorText(kit: LocalTailorKit | null) {
  return kit?.resume?.textContent?.trim() ?? "";
}

function dataUrlToBlob(dataUrl: string) {
  const [prefix, base64 = ""] = dataUrl.split(",", 2);
  const mimeMatch = prefix.match(/data:([^;]+);base64/);
  const mimeType = mimeMatch?.[1] ?? "application/octet-stream";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

function withObjectUrl(dataUrl: string, fn: (url: string) => void) {
  const url = URL.createObjectURL(dataUrlToBlob(dataUrl));
  try {
    fn(url);
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  }
}

export function openLocalResume(asset: LocalResumeAsset | null) {
  if (!asset || typeof window === "undefined") return;
  withObjectUrl(asset.dataUrl, (url) => {
    window.open(url, "_blank", "noopener,noreferrer");
  });
}

export function downloadLocalResume(asset: LocalResumeAsset | null) {
  if (!asset || typeof document === "undefined") return;
  withObjectUrl(asset.dataUrl, (url) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = asset.fileName;
    anchor.rel = "noopener";
    anchor.click();
  });
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
