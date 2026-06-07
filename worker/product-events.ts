const ALLOWED_PROPERTIES = new Set([
  "source",
  "score",
  "threshold",
  "report_type",
  "status",
  "provider",
  "model",
  "count",
  "latency_ms",
  "onboarding_version",
]);

function sanitizeProperties(properties: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([key, value]) =>
        ALLOWED_PROPERTIES.has(key)
        && (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
      )
      .slice(0, 12)
  );
}

export async function recordProductEvent(
  db: D1Database,
  event: {
    userId?: string | null;
    sessionId?: string | null;
    name: string;
    entityType?: string | null;
    entityId?: string | null;
    properties?: Record<string, unknown>;
    occurredAt?: string;
  }
) {
  await db.prepare(
    `INSERT INTO product_events (
       id, user_id, session_id, event_name, entity_type, entity_id,
       properties_json, occurred_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    event.userId ?? null,
    event.sessionId ?? null,
    event.name.slice(0, 64),
    event.entityType?.slice(0, 32) ?? null,
    event.entityId?.slice(0, 128) ?? null,
    JSON.stringify(sanitizeProperties(event.properties ?? {})),
    event.occurredAt ?? new Date().toISOString()
  ).run();
}
