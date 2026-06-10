import { Hono } from "hono";
import { getActiveResumeAsset } from "../account";
import { decodeBase64DataUrl } from "../crypto";
import type { Env, Variables } from "../types";

const resumeAssets = new Hono<{ Bindings: Env; Variables: Variables }>();

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const ALLOWED_RESUME_MIME = new Set([
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function sanitizeFileName(fileName: string): string {
  const trimmed = fileName.trim() || "resume";
  return trimmed.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 120);
}

// Never trust the client's declared MIME. Take it only if allowlisted, otherwise
// fall back to the file extension; reject anything we don't recognize.
function resolveResumeMime(
  clientMime: string | undefined,
  decodedMime: string,
  fileName: string
): string | null {
  const candidate = (clientMime?.trim() || decodedMime || "").toLowerCase().split(";")[0];
  if (ALLOWED_RESUME_MIME.has(candidate)) return candidate;
  const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  switch (ext) {
    case "pdf": return "application/pdf";
    case "txt": return "text/plain";
    case "md":
    case "markdown": return "text/markdown";
    case "doc": return "application/msword";
    case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default: return null;
  }
}

function hasResumeSignature(mimeType: string, bytes: Uint8Array): boolean {
  const startsWith = (...signature: number[]) =>
    signature.every((value, index) => bytes[index] === value);

  if (mimeType === "application/pdf") {
    return startsWith(0x25, 0x50, 0x44, 0x46, 0x2d);
  }
  if (mimeType === "application/msword") {
    return startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return startsWith(0x50, 0x4b, 0x03, 0x04)
      || startsWith(0x50, 0x4b, 0x05, 0x06)
      || startsWith(0x50, 0x4b, 0x07, 0x08);
  }
  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    return !bytes.slice(0, 1024).includes(0);
  }
  return false;
}

function bytesToDataUrl(mimeType: string, bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mimeType};base64,${btoa(binary)}`;
}

resumeAssets.get("/", async (c) => {
  const asset = await getActiveResumeAsset(c.env.DB, c.get("userId"));
  if (!asset) {
    return c.json({ asset: null });
  }

  let dataUrl: string | null = null;
  if (c.env.RESUME_BUCKET) {
    const object = await c.env.RESUME_BUCKET.get(asset.storage_key);
    if (object) {
      const bytes = new Uint8Array(await object.arrayBuffer());
      dataUrl = bytesToDataUrl(asset.mime_type, bytes);
    }
  }

  return c.json({
    asset: {
      id: asset.id,
      fileName: asset.file_name,
      mimeType: asset.mime_type,
      size: asset.size,
      uploadedAt: asset.uploaded_at,
      extractedText: asset.extracted_text,
      dataUrl,
    },
  });
});

resumeAssets.post("/", async (c) => {
  if (!c.env.RESUME_BUCKET) {
    return c.json({ error: "Resume sync storage is not configured" }, 503);
  }

  const body = await c.req.json<{
    fileName?: string;
    mimeType?: string;
    size?: number;
    dataUrl?: string;
    extractedText?: string | null;
  }>().catch(() => null);

  if (!body?.fileName || !body.dataUrl) {
    return c.json({ error: "Missing resume file payload" }, 400);
  }

  let decoded: { mimeType: string; bytes: Uint8Array };
  try {
    decoded = decodeBase64DataUrl(body.dataUrl);
  } catch {
    return c.json({ error: "Could not read the uploaded file" }, 400);
  }

  // Enforce limits server-side; the client-supplied size/MIME are not trusted.
  if (decoded.bytes.byteLength > MAX_RESUME_BYTES) {
    return c.json({ error: "Resume files are capped at 5 MB" }, 413);
  }
  const mimeType = resolveResumeMime(body.mimeType, decoded.mimeType, body.fileName);
  if (!mimeType) {
    return c.json({ error: "Unsupported resume file type. Upload a PDF, Word, or text file." }, 415);
  }
  if (!hasResumeSignature(mimeType, decoded.bytes)) {
    return c.json({ error: "The file contents do not match the selected resume type." }, 415);
  }

  const userId = c.get("userId");
  const fileName = sanitizeFileName(body.fileName);
  const size = decoded.bytes.byteLength;
  const assetId = crypto.randomUUID();
  const uploadedAt = new Date().toISOString();
  const storageKey = `resumes/${userId}/${assetId}-${fileName}`;

  // Superseded assets (and their R2 objects) are replaced wholesale below so we
  // don't leak orphaned objects on every re-upload.
  const superseded = await c.env.DB.prepare(
    "SELECT storage_key FROM resume_assets WHERE user_id = ?"
  ).bind(userId).all<{ storage_key: string }>();

  await c.env.RESUME_BUCKET.put(storageKey, decoded.bytes, {
    httpMetadata: { contentType: mimeType },
  });

  try {
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM resume_assets WHERE user_id = ?").bind(userId),
      c.env.DB.prepare(
        `INSERT INTO resume_assets (
           id, user_id, file_name, mime_type, size, uploaded_at, storage_key, extracted_text, is_active
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
      ).bind(
        assetId,
        userId,
        fileName,
        mimeType,
        size,
        uploadedAt,
        storageKey,
        body.extractedText?.trim().slice(0, 100_000) || null
      ),
    ]);
  } catch (error) {
    // The DB write failed — remove the object we just uploaded so it isn't orphaned.
    await c.env.RESUME_BUCKET.delete(storageKey).catch(() => undefined);
    throw error;
  }

  // Best-effort cleanup of the previous objects now that the swap committed.
  await Promise.all(
    (superseded.results ?? [])
      .map((row) => row.storage_key)
      .filter((key) => key && key !== storageKey)
      .map((key) => c.env.RESUME_BUCKET!.delete(key).catch((error) => {
        console.error("Failed to delete superseded resume object", {
          storage_key: key,
          message: error instanceof Error ? error.message : String(error),
        });
      }))
  );

  return c.json({
    asset: {
      id: assetId,
      fileName,
      mimeType,
      size,
      uploadedAt,
      extractedText: body.extractedText?.trim() || null,
      dataUrl: body.dataUrl,
    },
  }, 201);
});

resumeAssets.delete("/active", async (c) => {
  const asset = await getActiveResumeAsset(c.env.DB, c.get("userId"));
  if (!asset) {
    return c.body(null, 204);
  }

  if (c.env.RESUME_BUCKET) {
    await c.env.RESUME_BUCKET.delete(asset.storage_key).catch(() => undefined);
  }

  await c.env.DB.prepare(
    "DELETE FROM resume_assets WHERE id = ?"
  ).bind(asset.id).run();

  return c.body(null, 204);
});

export default resumeAssets;
