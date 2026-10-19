import { Hono } from "hono";
import { requireAdmin } from "../auth";
import { importContacts, MAX_IMPORT_ROWS, parseContactCsv, removeContactEmail, unlistContact, type ContactImportRow } from "../outreach/contact-admin";
import { outreachTestRecipient } from "../outreach/contacts";
import type { Env, Variables } from "../types";

/** Admin's contact list for outreach (docs/backend-inventory-2026-10-16.md,
 * step 8): who's on People, imports, taking someone off, and removal
 * requests. Sourced recruiters are listed by labelling them in Admin →
 * Recruiters. */
const contacts = new Hono<{ Bindings: Env; Variables: Variables }>();

contacts.use("*", requireAdmin);

const STATUSES = ["listed", "hidden", "bounced", "removed"] as const;

contacts.get("/", async (c) => {
  const status = c.req.query("status");
  const companyId = c.req.query("company_id");
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 100, 1), 500);
  const filters: string[] = ["cc.source NOT IN ('test', 'pinkslip-test')"];
  const binds: unknown[] = [];
  if (status && (STATUSES as readonly string[]).includes(status)) {
    filters.push("cc.status = ?");
    binds.push(status);
  }
  if (companyId) {
    filters.push("cc.company_id = ?");
    binds.push(companyId);
  }
  const [counts, rows] = await Promise.all([
    c.env.DB.prepare(
      `SELECT status, COUNT(*) AS count FROM company_contacts
       WHERE source NOT IN ('test', 'pinkslip-test') GROUP BY status`
    ).all<{ status: string; count: number }>(),
    c.env.DB.prepare(
      `SELECT cc.id, cc.company_id, co.name AS company_name, cc.email, cc.name, cc.title, cc.source, cc.status,
              cc.profile_url, cc.candidate_id, cc.created_at,
              (SELECT COUNT(*) FROM outreach_threads ot WHERE ot.contact_id = cc.id AND ot.status != 'draft') AS threads
       FROM company_contacts cc JOIN companies co ON co.id = cc.company_id
       WHERE ${filters.join(" AND ")}
       ORDER BY cc.created_at DESC LIMIT ?`
    ).bind(...binds, limit).all(),
  ]);
  return c.json({
    // While a test recipient stands in, every email is addressed to it.
    test_recipient: Boolean(outreachTestRecipient(c.env)),
    counts: counts.results ?? [],
    contacts: rows.results ?? [],
  });
});

/** JSON ({ rows, dry_run }) or a CSV body; ?dry_run=1 reports without writing. */
contacts.post("/import", async (c) => {
  let rows: ContactImportRow[];
  let dryRun = c.req.query("dry_run") === "1";
  if ((c.req.header("content-type") ?? "").includes("text/csv")) {
    rows = parseContactCsv(await c.req.text());
  } else {
    const body = await c.req.json<{ rows?: unknown; dry_run?: unknown }>().catch(() => null);
    if (!Array.isArray(body?.rows)) return c.json({ error: "Send rows, or a CSV with a header row" }, 400);
    rows = body.rows.filter((row): row is ContactImportRow =>
      typeof row === "object" && row !== null && typeof (row as ContactImportRow).email === "string")
      .map((row) => ({ ...row, company: typeof row.company === "string" ? row.company : "" }));
    dryRun ||= body.dry_run === true;
  }
  if (rows.length > MAX_IMPORT_ROWS) return c.json({ error: `At most ${MAX_IMPORT_ROWS} rows at a time` }, 400);
  return c.json({ dry_run: dryRun, ...await importContacts(c.env.DB, rows, { dryRun }) });
});

/** A recruiter asked to be left alone: gone from every list, for good. */
contacts.post("/remove", async (c) => {
  const body = await c.req.json<{ email?: unknown }>().catch(() => null);
  if (typeof body?.email !== "string" || !body.email.includes("@")) return c.json({ error: "Send the email address" }, 400);
  return c.json(await removeContactEmail(c.env.DB, body.email));
});

/** Off People (an imported contact). */
contacts.delete("/:id", async (c) =>
  await unlistContact(c.env.DB, c.req.param("id")) ? c.body(null, 204) : c.json({ error: "Not found" }, 404));

export default contacts;
