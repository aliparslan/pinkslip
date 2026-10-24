import type { ResumeUpload } from "./send-engine";

/** Auto-apply's files in RESUME_BUCKET: the resume a send uploads and each
 * send's pictures. Kept apart from sends.ts so account deletion can use it. */

const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export class ResumeFileError extends Error {}

/** The resume lives on the phone for assisted apply; server sends need their
 * own copy, kept beside tailored resumes and deleted with the account. */
export const applyResumeKey = (userId: string) => `apply/${userId}/resume.pdf`;
export const shotKey = (userId: string, sendId: string, which: "form" | "confirmation") => `apply/${userId}/sends/${sendId}/${which}.jpg`;

export async function saveApplyResume(bucket: R2Bucket, userId: string, bytes: ArrayBuffer, name: string, now = new Date()) {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_RESUME_BYTES) {
    throw new ResumeFileError("The resume must be a PDF of 5 MB or less.");
  }
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") {
    throw new ResumeFileError("The resume must be a PDF.");
  }
  const fileName = (name.trim().replace(/[^\w .()-]+/g, "").slice(0, 100) || "Resume").replace(/(\.pdf)?$/i, ".pdf");
  await bucket.put(applyResumeKey(userId), bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { name: fileName, uploaded_at: now.toISOString() },
  });
  return { name: fileName, size: bytes.byteLength, uploaded_at: now.toISOString() };
}

export async function applyResumeInfo(bucket: R2Bucket, userId: string) {
  const head = await bucket.head(applyResumeKey(userId));
  if (!head) return null;
  return { name: head.customMetadata?.name ?? "Resume.pdf", size: head.size, uploaded_at: head.customMetadata?.uploaded_at ?? head.uploaded.toISOString() };
}

/** The resume and every send's pictures, for account deletion. */
export async function deleteApplyFiles(bucket: R2Bucket, userId: string) {
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix: `apply/${userId}/`, cursor });
    if (listed.objects.length > 0) await bucket.delete(listed.objects.map((object) => object.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

/** The file's name is what the employer sees: the uploaded name, or
 * "<Name>_Resume.pdf" for a copy put there with wrangler. */
export async function loadResume(bucket: R2Bucket, userId: string, personName = ""): Promise<ResumeUpload | null> {
  const object = await bucket.get(applyResumeKey(userId));
  if (!object) return null;
  const bytes = new Uint8Array(await object.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  const fallback = `${personName.trim().replace(/[^\w]+/g, "_").replace(/^_|_$/g, "")}_Resume.pdf`.replace(/^_/, "");
  return { name: object.customMetadata?.name ?? fallback, base64: btoa(binary) };
}
