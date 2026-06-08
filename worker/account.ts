import type {
  CorpusVersionRow,
  PreferenceRow,
  ProfileRow,
  ResumeAssetRow,
  ResumeProfile,
  TailoringRow,
} from "./types";

const LEGACY_PREFERENCE_KEYS = new Set([
  "locations",
  "min_yoe",
  "max_yoe",
  "role_keywords",
  "negative_keywords",
  "notify_threshold",
  "notification_threshold",
  "search_profile",
]);

const EMPTY_PROFILE: ResumeProfile = {
  contact: { name: "", email: "", phone: "", location: "", linkedin: "", github: "", website: "" },
  experience: [],
  education: [],
  projects: [],
  skills: [],
  optionalSections: [],
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function saveMergeBackup(
  db: D1Database,
  args: {
    userId: string;
    sourceUserId: string;
    kind: string;
    payload: unknown;
    label: string;
  }
) {
  await db.prepare(
    `INSERT INTO account_merge_backups (id, user_id, source_user_id, kind, label, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    args.userId,
    args.sourceUserId,
    args.kind,
    args.label,
    JSON.stringify(args.payload),
    new Date().toISOString()
  ).run();
}

async function hasUserPreferenceRows(db: D1Database, userId: string) {
  const row = await db.prepare(
    "SELECT 1 AS ok FROM user_preferences WHERE user_id = ? LIMIT 1"
  ).bind(userId).first<{ ok: number }>();
  return Boolean(row?.ok);
}

export async function ensureUserPreferencesMigrated(db: D1Database, userId: string) {
  if (await hasUserPreferenceRows(db, userId)) return;

  const legacy = await db.prepare(
    "SELECT key, value FROM preferences"
  ).all<PreferenceRow>();
  const rows = (legacy.results ?? []).filter((row) => LEGACY_PREFERENCE_KEYS.has(row.key));
  if (rows.length === 0) return;

  const now = new Date().toISOString();
  await db.batch(
    rows.map((row) =>
      db.prepare(
        `INSERT INTO user_preferences (user_id, key, value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).bind(userId, row.key === "notification_threshold" ? "notify_threshold" : row.key, row.value, now)
    )
  );
}

export async function readUserPreferences(
  db: D1Database,
  userId: string
): Promise<Record<string, unknown>> {
  await ensureUserPreferencesMigrated(db, userId);
  const result = await db.prepare(
    `SELECT key, value, updated_at
     FROM user_preferences
     WHERE user_id = ?`
  ).bind(userId).all<PreferenceRow>();
  const out: Record<string, unknown> = {};
  for (const row of result.results ?? []) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }
  return out;
}

export async function writeUserPreferences(
  db: D1Database,
  userId: string,
  values: Array<{ key: string; value: string }>
) {
  if (values.length === 0) return;
  const now = new Date().toISOString();
  await db.batch(
    values.map(({ key, value }) =>
      db.prepare(
        `INSERT INTO user_preferences (user_id, key, value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).bind(userId, key, value, now)
    )
  );
}

export async function getUserProfile(
  db: D1Database,
  userId: string
): Promise<{ data: ResumeProfile; updated_at: string | null }> {
  const existing = await db.prepare(
    `SELECT user_id, data, created_at, updated_at
     FROM user_profiles
     WHERE user_id = ?`
  ).bind(userId).first<ProfileRow>();

  if (existing) {
    try {
      return {
        data: { ...EMPTY_PROFILE, ...(JSON.parse(existing.data) as ResumeProfile) },
        updated_at: existing.updated_at,
      };
    } catch {
      return { data: EMPTY_PROFILE, updated_at: existing.updated_at };
    }
  }

  const legacy = await db.prepare(
    `SELECT data, created_at, updated_at
     FROM profile
     ORDER BY id DESC
     LIMIT 1`
  ).first<{ data: string; created_at: string; updated_at: string }>();

  if (!legacy) {
    return { data: EMPTY_PROFILE, updated_at: null };
  }

  await db.prepare(
    `INSERT INTO user_profiles (user_id, data, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO NOTHING`
  ).bind(userId, legacy.data, legacy.created_at, legacy.updated_at).run();

  try {
    return {
      data: { ...EMPTY_PROFILE, ...(JSON.parse(legacy.data) as ResumeProfile) },
      updated_at: legacy.updated_at,
    };
  } catch {
    return { data: EMPTY_PROFILE, updated_at: legacy.updated_at };
  }
}

export async function saveUserProfile(
  db: D1Database,
  userId: string,
  profile: ResumeProfile
): Promise<{ data: ResumeProfile; updated_at: string }> {
  const now = new Date().toISOString();
  const dataJson = JSON.stringify(profile);
  await db.prepare(
    `INSERT INTO user_profiles (user_id, data, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  ).bind(userId, dataJson, now, now).run();
  return { data: profile, updated_at: now };
}

export async function getLatestUserCorpusVersion(
  db: D1Database,
  userId: string
): Promise<CorpusVersionRow | null> {
  const userVersion = await db.prepare(
    `SELECT id, user_id, content_md, label, created_at, updated_at
     FROM corpus_versions
     WHERE user_id = ?
     ORDER BY datetime(updated_at) DESC, id DESC
     LIMIT 1`
  ).bind(userId).first<CorpusVersionRow>();

  if (userVersion) return userVersion;

  const legacy = await db.prepare(
    `SELECT id, user_id, content_md, label, created_at, updated_at
     FROM corpus_versions
     WHERE user_id IS NULL
     ORDER BY datetime(updated_at) DESC, id DESC
     LIMIT 1`
  ).first<CorpusVersionRow>();

  if (!legacy) return null;

  const copiedId = await copyCorpusVersion(db, userId, legacy.content_md, legacy.label);
  return db.prepare(
    `SELECT id, user_id, content_md, label, created_at, updated_at
     FROM corpus_versions
     WHERE id = ?`
  ).bind(copiedId).first<CorpusVersionRow>();
}

export async function copyCorpusVersion(
  db: D1Database,
  userId: string,
  contentMd: string,
  label: string | null
): Promise<number> {
  const now = new Date().toISOString();
  await db.prepare(
    `INSERT INTO corpus_versions (user_id, content_md, label, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).bind(userId, contentMd, label, now, now).run();
  const created = await db.prepare(
    "SELECT id FROM corpus_versions WHERE user_id = ? ORDER BY id DESC LIMIT 1"
  ).bind(userId).first<{ id: number }>();
  return created?.id ?? 0;
}

export async function getLatestUserTailoring(
  db: D1Database,
  userId: string,
  jobId: string
): Promise<TailoringRow | null> {
  const row = await db.prepare(
    `SELECT *
     FROM tailorings
     WHERE user_id = ? AND job_id = ?
     ORDER BY datetime(created_at) DESC, created_at DESC
     LIMIT 1`
  ).bind(userId, jobId).first<TailoringRow>();
  if (row) return row;

  const legacy = await db.prepare(
    `SELECT *
     FROM tailorings
     WHERE user_id IS NULL AND job_id = ?
     ORDER BY datetime(created_at) DESC, created_at DESC
     LIMIT 1`
  ).bind(jobId).first<TailoringRow>();

  if (!legacy) return null;

  const newId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO tailorings (
       id, user_id, job_id, corpus_version_id, resume_md, cover_letter_md, qa_json,
       input_tokens, output_tokens, model, created_at, user_edited_resume_md, user_edited_cover_md, user_edited_qa_json
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    newId,
    userId,
    legacy.job_id,
    legacy.corpus_version_id,
    legacy.resume_md,
    legacy.cover_letter_md,
    legacy.qa_json,
    legacy.input_tokens,
    legacy.output_tokens,
    legacy.model,
    legacy.created_at,
    legacy.user_edited_resume_md,
    legacy.user_edited_cover_md,
    legacy.user_edited_qa_json
  ).run();

  return db.prepare("SELECT * FROM tailorings WHERE id = ?").bind(newId).first<TailoringRow>();
}

export async function getActiveResumeAsset(
  db: D1Database,
  userId: string
): Promise<ResumeAssetRow | null> {
  return db.prepare(
    `SELECT id, user_id, file_name, mime_type, size, uploaded_at, storage_key, extracted_text, is_active
     FROM resume_assets
     WHERE user_id = ? AND is_active = 1
     ORDER BY datetime(uploaded_at) DESC, id DESC
     LIMIT 1`
  ).bind(userId).first<ResumeAssetRow>();
}

async function copyMissingPreferences(db: D1Database, sourceUserId: string, targetUserId: string) {
  await ensureUserPreferencesMigrated(db, sourceUserId);
  await ensureUserPreferencesMigrated(db, targetUserId);

  const source = await db.prepare(
    "SELECT key, value, updated_at FROM user_preferences WHERE user_id = ?"
  ).bind(sourceUserId).all<PreferenceRow>();
  const target = await db.prepare(
    "SELECT key, value, updated_at FROM user_preferences WHERE user_id = ?"
  ).bind(targetUserId).all<PreferenceRow>();
  const targetMap = new Map((target.results ?? []).map((row) => [row.key, row]));

  const stmts: D1PreparedStatement[] = [];
  for (const row of source.results ?? []) {
    const existing = targetMap.get(row.key);
    const shouldOverwrite = !existing || (row.updated_at ?? "") > (existing.updated_at ?? "");
    if (!shouldOverwrite) continue;
    stmts.push(
      db.prepare(
        `INSERT INTO user_preferences (user_id, key, value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      ).bind(targetUserId, row.key, row.value, row.updated_at ?? new Date().toISOString())
    );
  }
  if (stmts.length > 0) await db.batch(stmts);
}

async function mergeSingletonProfile(db: D1Database, sourceUserId: string, targetUserId: string, label: string) {
  const source = await db.prepare(
    "SELECT user_id, data, created_at, updated_at FROM user_profiles WHERE user_id = ?"
  ).bind(sourceUserId).first<ProfileRow>();
  if (!source) return;

  const target = await db.prepare(
    "SELECT user_id, data, created_at, updated_at FROM user_profiles WHERE user_id = ?"
  ).bind(targetUserId).first<ProfileRow>();

  if (!target) {
    await db.prepare(
      `INSERT INTO user_profiles (user_id, data, created_at, updated_at)
       VALUES (?, ?, ?, ?)`
    ).bind(targetUserId, source.data, source.created_at, source.updated_at).run();
    return;
  }

  if (target.data !== source.data) {
    await saveMergeBackup(db, {
      userId: targetUserId,
      sourceUserId,
      kind: "profile",
      payload: {
        data: source.data,
        created_at: source.created_at,
        updated_at: source.updated_at,
      },
      label,
    });
  }
}

async function mergeSingletonCorpus(db: D1Database, sourceUserId: string, targetUserId: string, label: string) {
  const source = await getLatestUserCorpusVersion(db, sourceUserId);
  if (!source) return;
  const target = await getLatestUserCorpusVersion(db, targetUserId);
  if (!target) {
    await copyCorpusVersion(db, targetUserId, source.content_md, source.label);
    return;
  }

  if (target.content_md !== source.content_md) {
    await saveMergeBackup(db, {
      userId: targetUserId,
      sourceUserId,
      kind: "corpus",
      payload: source,
      label,
    });
  }
}

async function mergeResumeAssets(
  db: D1Database,
  sourceUserId: string,
  targetUserId: string,
  label: string
) {
  const source = await getActiveResumeAsset(db, sourceUserId);
  if (!source) return;
  const target = await getActiveResumeAsset(db, targetUserId);
  if (!target) {
    await db.prepare(
      "UPDATE resume_assets SET user_id = ? WHERE id = ?"
    ).bind(targetUserId, source.id).run();
    return;
  }

  await saveMergeBackup(db, {
    userId: targetUserId,
    sourceUserId,
    kind: "resume_asset",
    payload: source,
    label,
  });
}

export async function mergeGuestDataIntoAccount(
  db: D1Database,
  args: {
    sourceUserId: string;
    targetUserId: string;
    sourceLabel: string;
  }
) {
  const { sourceUserId, targetUserId, sourceLabel } = args;
  if (sourceUserId === targetUserId) return;

  await copyMissingPreferences(db, sourceUserId, targetUserId);
  await db.prepare(
    `INSERT INTO user_search_profiles (
       user_id, profile_json, match_threshold, notifications_enabled,
       onboarding_version, onboarding_completed_at, match_cursor_seen_at,
       created_at, updated_at
     )
     SELECT ?, profile_json, match_threshold, notifications_enabled,
            onboarding_version, onboarding_completed_at, NULL, created_at, updated_at
     FROM user_search_profiles
     WHERE user_id = ?
     ON CONFLICT(user_id) DO UPDATE SET
       profile_json = excluded.profile_json,
       match_threshold = excluded.match_threshold,
       notifications_enabled = excluded.notifications_enabled,
       onboarding_version = excluded.onboarding_version,
       onboarding_completed_at = excluded.onboarding_completed_at,
       match_cursor_seen_at = NULL,
       updated_at = excluded.updated_at
     WHERE datetime(excluded.updated_at) > datetime(user_search_profiles.updated_at)`
  ).bind(targetUserId, sourceUserId).run().catch(() => undefined);
  await db.prepare("DELETE FROM user_job_matches WHERE user_id = ?")
    .bind(targetUserId)
    .run()
    .catch(() => undefined);
  await db.prepare(
    "UPDATE user_search_profiles SET match_cursor_seen_at = NULL WHERE user_id = ?"
  ).bind(targetUserId).run().catch(() => undefined);

  await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO saved_jobs (user_id, job_id, saved_at)
       SELECT ?, job_id, saved_at
       FROM saved_jobs
       WHERE user_id = ?`
    ).bind(targetUserId, sourceUserId),
    db.prepare(
      `INSERT OR IGNORE INTO dismissed_jobs (user_id, job_id, dismissed_at)
       SELECT ?, job_id, dismissed_at
       FROM dismissed_jobs
       WHERE user_id = ?`
    ).bind(targetUserId, sourceUserId),
    db.prepare(
      `INSERT OR IGNORE INTO user_blocked_companies (user_id, company_id, blocked_at)
       SELECT ?, company_id, blocked_at
       FROM user_blocked_companies
       WHERE user_id = ?`
    ).bind(targetUserId, sourceUserId),
  ]);

  await db.prepare(
    `INSERT INTO user_notification_settings (
       user_id, enabled, push_enabled, threshold, updated_at
     )
     SELECT ?, enabled, push_enabled, threshold, updated_at
     FROM user_notification_settings
     WHERE user_id = ?
     ON CONFLICT(user_id) DO UPDATE SET
       enabled = excluded.enabled,
       push_enabled = excluded.push_enabled,
       threshold = excluded.threshold,
       updated_at = excluded.updated_at
     WHERE datetime(excluded.updated_at) > datetime(user_notification_settings.updated_at)`
  ).bind(targetUserId, sourceUserId).run().catch(() => undefined);

  await db.batch([
    db.prepare(
      `INSERT OR IGNORE INTO notification_candidates (
         id, user_id, job_id, channel, score, status, attempt_count, last_error,
         created_at, last_attempt_at, sent_at, opened_at
       )
       SELECT id, ?, job_id, channel, score, status, attempt_count, last_error,
              created_at, last_attempt_at, sent_at, opened_at
       FROM notification_candidates
       WHERE user_id = ?`
    ).bind(targetUserId, sourceUserId),
    db.prepare(
      `INSERT OR IGNORE INTO scorer_audits (
         user_id, job_id, stable_version, candidate_version, stable_score,
         candidate_score, delta, reasons_json, created_at
       )
       SELECT ?, job_id, stable_version, candidate_version, stable_score,
              candidate_score, delta, reasons_json, created_at
       FROM scorer_audits
       WHERE user_id = ?`
    ).bind(targetUserId, sourceUserId),
  ]).catch(() => undefined);

  const conflictingJobIds = await db.prepare(
    `SELECT a.job_id
     FROM applications a
     JOIN applications b
       ON a.job_id IS NOT NULL
      AND a.job_id = b.job_id
     WHERE a.user_id = ? AND b.user_id = ?`
  ).bind(sourceUserId, targetUserId).all<{ job_id: string }>();

  for (const row of conflictingJobIds.results ?? []) {
    const guest = await db.prepare(
      `SELECT * FROM applications
       WHERE user_id = ? AND job_id = ?
       ORDER BY datetime(updated_at) DESC
       LIMIT 1`
    ).bind(sourceUserId, row.job_id).first<any>();
    const account = await db.prepare(
      `SELECT * FROM applications
       WHERE user_id = ? AND job_id = ?
       ORDER BY datetime(updated_at) DESC
       LIMIT 1`
    ).bind(targetUserId, row.job_id).first<any>();

    if (guest && account && guest.updated_at > account.updated_at) {
      await db.prepare(
        `UPDATE applications
         SET company_name = ?, title = ?, stage = ?, next = ?, url = ?, updated_at = ?
         WHERE id = ?`
      ).bind(
        guest.company_name,
        guest.title,
        guest.stage,
        guest.next,
        guest.url,
        guest.updated_at,
        account.id
      ).run();
    }

    await db.prepare(
      "DELETE FROM applications WHERE user_id = ? AND job_id = ?"
    ).bind(sourceUserId, row.job_id).run();
  }

  await db.batch([
    db.prepare("UPDATE applications SET user_id = ? WHERE user_id = ?").bind(targetUserId, sourceUserId),
    db.prepare("UPDATE push_subscriptions SET user_id = ? WHERE user_id = ?").bind(targetUserId, sourceUserId),
    db.prepare("UPDATE tailorings SET user_id = ? WHERE user_id = ?").bind(targetUserId, sourceUserId),
    db.prepare("UPDATE content_reports SET user_id = ? WHERE user_id = ?").bind(targetUserId, sourceUserId),
    db.prepare("UPDATE feedback_submissions SET user_id = ? WHERE user_id = ?").bind(targetUserId, sourceUserId),
    db.prepare("UPDATE product_events SET user_id = ? WHERE user_id = ?").bind(targetUserId, sourceUserId),
  ]);

  await mergeSingletonProfile(db, sourceUserId, targetUserId, sourceLabel);
  await mergeSingletonCorpus(db, sourceUserId, targetUserId, sourceLabel);
  await mergeResumeAssets(db, sourceUserId, targetUserId, sourceLabel);

  await db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(sourceUserId).run();
  await db.prepare("DELETE FROM auth_identities WHERE user_id = ?").bind(sourceUserId).run();
  await db.prepare("DELETE FROM api_tokens WHERE user_id = ?").bind(sourceUserId).run();
  await db.prepare("DELETE FROM users WHERE id = ?").bind(sourceUserId).run();
}

export async function deleteUserAccountData(
  db: D1Database,
  userId: string,
  bucket?: R2Bucket
) {
  const assets = await db.prepare(
    "SELECT storage_key FROM resume_assets WHERE user_id = ?"
  ).bind(userId).all<{ storage_key: string }>();
  if (bucket) {
    await Promise.all(
      (assets.results ?? []).map((asset) => bucket.delete(asset.storage_key).catch(() => undefined))
    );
  }

  await db.batch([
    db.prepare("DELETE FROM auth_sessions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM email_login_tokens WHERE lower(email) IN (SELECT lower(email) FROM auth_identities WHERE user_id = ?)").bind(userId),
    db.prepare("DELETE FROM auth_identities WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM api_tokens WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM tailorings WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM corpus_versions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM resume_assets WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_preferences WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_profiles WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM saved_jobs WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM dismissed_jobs WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM applications WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_blocked_companies WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM user_notification_settings WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM notification_candidates WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM scorer_audits WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM content_reports WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM feedback_submissions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);

  await db.prepare("DELETE FROM tailor_usage WHERE user_id = ?").bind(userId).run().catch(() => undefined);
}
