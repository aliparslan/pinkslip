import { Hono } from "hono";
import { getActiveResumeAsset } from "../account";
import { decodeBase64DataUrl } from "../crypto";
import type { Env, Variables } from "../types";

const resumeAssets = new Hono<{ Bindings: Env; Variables: Variables }>();

function sanitizeFileName(fileName: string): string {
  const trimmed = fileName.trim() || "resume";
  return trimmed.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-");
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

  const decoded = decodeBase64DataUrl(body.dataUrl);
  const userId = c.get("userId");
  const fileName = sanitizeFileName(body.fileName);
  const mimeType = body.mimeType?.trim() || decoded.mimeType;
  const size = typeof body.size === "number" && body.size > 0 ? body.size : decoded.bytes.byteLength;
  const assetId = crypto.randomUUID();
  const uploadedAt = new Date().toISOString();
  const storageKey = `resumes/${userId}/${assetId}-${fileName}`;

  await c.env.RESUME_BUCKET.put(storageKey, decoded.bytes, {
    httpMetadata: { contentType: mimeType },
  });

  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE resume_assets SET is_active = 0 WHERE user_id = ? AND is_active = 1"
    ).bind(userId),
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
      body.extractedText?.trim() || null
    ),
  ]);

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
