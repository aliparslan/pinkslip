const R2_DELETE_BATCH_SIZE = 1_000;

export interface StoredArtifactRow {
  id: string;
  tailoring_id: string;
  user_id: string;
  revision: number;
  resume_json: string;
  validation_json: string;
  typst_source: string;
  template_version: string;
  compiler_version: string;
  pdf_storage_key: string;
  page_count: number | null;
  pdf_sha256: string | null;
  resume_sha256: string | null;
  typst_sha256: string | null;
  provenance_sha256: string | null;
  extracted_text_sha256: string | null;
  pdf_byte_size: number | null;
  compiler_origin: "client" | "service";
  verification_status: "client_only" | "server_reproduced" | "server_content_matched";
  retention_policy: "until_deleted";
  storage_state: "available" | "deleting" | "missing" | "corrupt";
  delete_requested_at: string | null;
  created_at: string;
  selected?: number;
}

export class ArtifactStorageUnavailableError extends Error {
  readonly code = "artifact_storage_unavailable";

  constructor(message = "Resume storage is temporarily unavailable. No account data was deleted.") {
    super(message);
    this.name = "ArtifactStorageUnavailableError";
  }
}

export async function sha256Hex(value: ArrayBuffer | Uint8Array | string): Promise<string> {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : value instanceof Uint8Array
      ? value
      : new Uint8Array(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function validSha256(value: string | null): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

export async function artifactProvenanceHash(args: {
  tailoringId: string;
  revision: number;
  resumeSha256: string;
  typstSha256: string;
  pdfSha256: string;
  templateVersion: string;
  compilerVersion: string;
  pageCount: number;
}): Promise<string> {
  return sha256Hex(JSON.stringify({
    tailoringId: args.tailoringId,
    revision: args.revision,
    resumeSha256: args.resumeSha256,
    typstSha256: args.typstSha256,
    pdfSha256: args.pdfSha256,
    templateVersion: args.templateVersion,
    compilerVersion: args.compilerVersion,
    pageCount: args.pageCount,
  }));
}

export async function insertArtifactMetadata(args: {
  db: D1Database;
  id: string;
  tailoringId: string;
  userId: string;
  revision: number;
  resumeJson: string;
  validationJson: string;
  typstSource: string;
  templateVersion: string;
  compilerVersion: string;
  pdfStorageKey: string;
  pageCount: number;
  pdfSha256: string;
  resumeSha256: string;
  typstSha256: string;
  provenanceSha256: string;
  extractedTextSha256: string | null;
  pdfByteSize: number;
  compilerOrigin: "client" | "service";
  verificationStatus: StoredArtifactRow["verification_status"];
  createdAt: string;
}): Promise<void> {
  await args.db.prepare(
    `INSERT INTO tailored_resume_artifacts (
       id, tailoring_id, user_id, revision, resume_json, validation_json,
       typst_source, template_version, compiler_version, pdf_storage_key,
       page_count, pdf_sha256, resume_sha256, typst_sha256, provenance_sha256,
       extracted_text_sha256, pdf_byte_size, compiler_origin,
       verification_status, retention_policy, storage_state, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'until_deleted', 'available', ?)`
  ).bind(
    args.id,
    args.tailoringId,
    args.userId,
    args.revision,
    args.resumeJson,
    args.validationJson,
    args.typstSource,
    args.templateVersion.slice(0, 80),
    args.compilerVersion.slice(0, 80),
    args.pdfStorageKey,
    args.pageCount,
    args.pdfSha256,
    args.resumeSha256,
    args.typstSha256,
    args.provenanceSha256,
    args.extractedTextSha256,
    args.pdfByteSize,
    args.compilerOrigin,
    args.verificationStatus,
    args.createdAt,
  ).run();
}

export async function deleteR2Keys(bucket: R2Bucket, keys: string[]): Promise<void> {
  for (let index = 0; index < keys.length; index += R2_DELETE_BATCH_SIZE) {
    await bucket.delete(keys.slice(index, index + R2_DELETE_BATCH_SIZE));
  }
}

export async function restoreArtifactDeletionState(args: {
  db: D1Database;
  userId: string;
  tailoringId: string;
  artifactId?: string;
}): Promise<void> {
  if (args.artifactId) {
    await args.db.prepare(
      `UPDATE tailored_resume_artifacts
       SET storage_state = 'available', delete_requested_at = NULL
       WHERE id = ? AND tailoring_id = ? AND user_id = ? AND storage_state = 'deleting'`
    ).bind(args.artifactId, args.tailoringId, args.userId).run();
    return;
  }
  await args.db.prepare(
    `UPDATE tailored_resume_artifacts
     SET storage_state = 'available', delete_requested_at = NULL
     WHERE tailoring_id = ? AND user_id = ? AND storage_state = 'deleting'`
  ).bind(args.tailoringId, args.userId).run();
}

export async function deleteUserArtifactObjects(args: {
  db: D1Database;
  bucket?: R2Bucket;
  userId: string;
}): Promise<number> {
  const rows = await args.db.prepare(
    `SELECT id, pdf_storage_key
     FROM tailored_resume_artifacts
     WHERE user_id = ?`
  ).bind(args.userId).all<{ id: string; pdf_storage_key: string }>();
  const artifacts = rows.results ?? [];
  if (artifacts.length === 0) return 0;
  if (!args.bucket) throw new ArtifactStorageUnavailableError();

  const requestedAt = new Date().toISOString();
  await args.db.prepare(
    `UPDATE tailored_resume_artifacts
     SET storage_state = 'deleting', delete_requested_at = ?
     WHERE user_id = ?`
  ).bind(requestedAt, args.userId).run();

  try {
    await deleteR2Keys(args.bucket, artifacts.map((artifact) => artifact.pdf_storage_key));
  } catch {
    throw new ArtifactStorageUnavailableError();
  }
  return artifacts.length;
}
