import { Hono } from "hono";
import { requireAdmin } from "../auth";
import { importContacts, MAX_IMPORT_ROWS, parseContactCsv, rejectContact, removeContactEmail, type ContactImportRow } from "../outreach/contact-admin";
import { outreachTestRecipient } from "../outreach/contacts";
import { checkDueContacts, CHECKS_PER_RUN, emailCheckerFor } from "../outreach/email-check";
import { runContactFinding } from "../outreach/shared-inboxes";
import type { Env, Variables } from "../types";

/** Admin's contact list for outreach (docs/backend-inventory-2026-10-16.md,
 * step 8): what's on it and how it's doing, imports, removal requests, and
 * running the checks or the shared-inbox search now. */
const contacts = new Hono<{ Bindings: Env; Variables: Variables }>();

contacts.use("*", requireAdmin);

const STATUSES = ["unchecked", "valid", "catch_all", "unknown", "invalid", "bounced", "rejected", "removed"] as const;

contacts.get("/", async (c) => {
  const status = c.req.query("status");
  const companyId = c.req.query("company_id");
  const limit = Math.min(Math.max(Number(c.req.query("limit")) || 100, 1), 500);
  const filters: string[] = ["cc.source NOT IN ('test', 'pinkslip-test')"];
  const binds: unknown[] = [];
  if (status && (STATUSES as readonly string[]).includes(status)) {
    filters.push("cc.email_status = ?");
    binds.push(status);
  }
  if (companyId) {
    filters.push("cc.company_id = ?");
    binds.push(companyId);
  }
  const [byStatus, finding, rows] = await Promise.all([
    c.env.DB.prepare(
      `SELECT email_status AS status, kind, COUNT(*) AS count FROM company_contacts
       WHERE source NOT IN ('test', 'pinkslip-test') GROUP BY email_status, kind`
    ).all<{ status: string; kind: string; count: number }>(),
    c.env.DB.prepare("SELECT outcome, COUNT(*) AS count FROM contact_finding GROUP BY outcome")
      .all<{ outcome: string; count: number }>(),
    c.env.DB.prepare(
      `SELECT cc.id, cc.company_id, co.name AS company_name, cc.email, cc.name, cc.title, cc.kind, cc.source,
              cc.email_status, cc.checked_at, cc.evidence_url, cc.created_at,
              (SELECT COUNT(*) FROM outreach_threads ot WHERE ot.contact_id = cc.id AND ot.status != 'draft') AS threads
       FROM company_contacts cc JOIN companies co ON co.id = cc.company_id
       WHERE ${filters.join(" AND ")}
       ORDER BY cc.created_at DESC LIMIT ?`
    ).bind(...binds, limit).all(),
  ]);
  return c.json({
    // While a test recipient stands in, users see only it, whatever is here.
    test_recipient: Boolean(outreachTestRecipient(c.env)),
    checker: Boolean(emailCheckerFor(c.env)),
    finder: c.env.CONTACT_FINDER?.trim().toLowerCase() === "on",
    counts: byStatus.results ?? [],
    companies_searched: finding.results ?? [],
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

/** Not a useful contact: hidden and never added again. */
contacts.delete("/:id", async (c) =>
  await rejectContact(c.env.DB, c.req.param("id")) ? c.body(null, 204) : c.json({ error: "Not found" }, 404));

/** The weekly checks, now: the addresses that are due, up to a cycle's worth. */
contacts.post("/check", async (c) => {
  const checker = emailCheckerFor(c.env);
  if (!checker) return c.json({ error: "EMAIL_CHECK_API_KEY isn't set." }, 503);
  const body = await c.req.json<{ limit?: unknown }>().catch(() => ({}) as { limit?: unknown });
  const limit = typeof body.limit === "number" && Number.isInteger(body.limit) ? Math.min(Math.max(body.limit, 1), CHECKS_PER_RUN) : CHECKS_PER_RUN;
  return c.json(await checkDueContacts(c.env, checker, { limit }));
});

/** The shared-inbox search, now: one company, or the next few due. */
contacts.post("/find", async (c) => {
  const checker = emailCheckerFor(c.env);
  if (!checker) return c.json({ error: "EMAIL_CHECK_API_KEY isn't set." }, 503);
  const body = await c.req.json<{ company_id?: unknown; count?: unknown }>().catch(() => ({}) as { company_id?: unknown; count?: unknown });
  const companyId = typeof body.company_id === "string" && body.company_id ? body.company_id : undefined;
  const count = typeof body.count === "number" && Number.isInteger(body.count) ? Math.min(Math.max(body.count, 1), 3) : 1;
  return c.json({ runs: await runContactFinding(c.env, checker, { companyId, count }) });
});

export default contacts;
