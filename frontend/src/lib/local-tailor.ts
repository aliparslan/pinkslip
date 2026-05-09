export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

const KIT_KEY = "pinkslip.local-tailor-kit.v1";
const DRAFTS_KEY = "pinkslip.local-tailor-drafts.v1";
const MAX_RESUME_BYTES = 2 * 1024 * 1024;

export interface LocalResumeAsset {
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  dataUrl: string;
  textContent: string | null;
  textFormat: "plain" | "markdown" | "latex" | "binary";
  canTailor: boolean;
}

export interface LocalTailorKit {
  anthropicApiKey: string;
  anthropicModel: string;
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

function extensionOf(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

export function isTextResumeFile(fileName: string, mimeType = "") {
  const ext = extensionOf(fileName);
  if (mimeType.startsWith("text/")) return true;
  return ["txt", "md", "markdown", "tex", "rtf"].includes(ext);
}

export function normalizeLatexResume(input: string) {
  return input
    .replace(/%.*$/gm, "")
    .replace(/\\href\{([^}]+)\}\{([^}]+)\}/g, "$2 ($1)")
    .replace(/\\(?:textbf|textit|emph|underline)\{([^}]+)\}/g, "$1")
    .replace(/\\section\*?\{([^}]+)\}/g, "\n## $1\n")
    .replace(/\\subsection\*?\{([^}]+)\}/g, "\n### $1\n")
    .replace(/\\subsubsection\*?\{([^}]+)\}/g, "\n#### $1\n")
    .replace(/\\item\s*/g, "- ")
    .replace(/\\begin\{[^}]+\}/g, "\n")
    .replace(/\\end\{[^}]+\}/g, "\n")
    .replace(/\\\\/g, "\n")
    .replace(/\\[a-zA-Z@]+(\[[^\]]*\])?(\{[^}]*\})?/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export async function createLocalResumeAsset(file: File): Promise<LocalResumeAsset> {
  if (file.size > MAX_RESUME_BYTES) {
    throw new Error("Resume uploads are capped at 2 MB for browser-local storage");
  }

  const dataUrl = await readAsDataUrl(file);
  let textContent: string | null = null;
  let textFormat: LocalResumeAsset["textFormat"] = "binary";

  if (isTextResumeFile(file.name, file.type)) {
    const rawText = await readAsText(file);
    if (extensionOf(file.name) === "tex") {
      textContent = normalizeLatexResume(rawText);
      textFormat = "latex";
    } else if (["md", "markdown"].includes(extensionOf(file.name))) {
      textContent = rawText.trim();
      textFormat = "markdown";
    } else {
      textContent = rawText.trim();
      textFormat = "plain";
    }
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
  return {
    anthropicApiKey: typeof kit.anthropicApiKey === "string" ? kit.anthropicApiKey : "",
    anthropicModel:
      typeof kit.anthropicModel === "string" && kit.anthropicModel.trim()
        ? kit.anthropicModel.trim()
        : DEFAULT_ANTHROPIC_MODEL,
    resume: kit.resume ?? null,
  };
}

export function saveLocalTailorKit(next: LocalTailorKit) {
  writeJson(KIT_KEY, next);
}

export function updateLocalTailorKit(patch: Partial<LocalTailorKit>) {
  const current = loadLocalTailorKit();
  saveLocalTailorKit({
    ...current,
    ...patch,
    anthropicModel: (patch.anthropicModel ?? current.anthropicModel ?? DEFAULT_ANTHROPIC_MODEL).trim()
      || DEFAULT_ANTHROPIC_MODEL,
  });
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

export function clearLocalTailorDraft(jobId: string) {
  const drafts = loadDraftMap();
  delete drafts[jobId];
  saveDraftMap(drafts);
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
