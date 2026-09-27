/**
 * Resolve a historical job UUID to its surviving logical job. Missing aliases
 * (and pre-migration databases during a rolling deploy) deliberately fall back
 * to the requested ID so normal not-found behavior remains unchanged.
 */
export async function resolveJobId(db: D1Database, requestedId: string) {
  try {
    const alias = await db.prepare(
      "SELECT job_id FROM job_aliases WHERE alias_id = ?"
    ).bind(requestedId).first<{ job_id: string }>();
    return alias?.job_id ?? requestedId;
  } catch {
    return requestedId;
  }
}

export async function resolveJobIds(db: D1Database, requestedIds: string[]) {
  if (requestedIds.length === 0) return [];
  try {
    const results = await db.batch(requestedIds.map((requestedId) =>
      db.prepare("SELECT job_id FROM job_aliases WHERE alias_id = ?")
        .bind(requestedId)
    ));
    return requestedIds.map((requestedId, index) => {
      const row = results[index]?.results?.[0] as { job_id?: unknown } | undefined;
      return typeof row?.job_id === "string" ? row.job_id : requestedId;
    });
  } catch {
    return requestedIds;
  }
}
