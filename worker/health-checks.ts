// A check every 15 minutes that the feed loads, sign-in works and a push goes
// out (docs/backend-inventory-2026-10-16.md, Decisions: Admin #2). A failure
// alerts the owner: by push, and by email too when push is what broke.

import { notifyAdmins } from "./admin-alerts";
import { apnsReason, resolveApnsConfig, sendApnsBackgroundPush, type ApnsConfig } from "./apns";
import { describeThrown, recordError } from "./errors";
import { shouldAlert } from "./polling-watchdog";
import type { NotificationPayload, PushResult } from "./push";
import type { Env } from "./types";

/** Its own cron, so the checks get a fresh invocation, apart from polling. */
export const HEALTH_CRON_SCHEDULE = "7,22,37,52 * * * *";

/** Where people load Pinkslip; the iPhone app's API calls go through it too. */
export const SITE_ORIGIN = "https://pinkslip.work";

const STATE_KEY = "health_checks";
const CHECK_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 2_000;

export type HealthCheckName = "feed" | "sign_in" | "push";

export interface HealthCheckResult {
  name: HealthCheckName;
  ok: boolean;
  detail: string;
  ms: number;
}

export interface HealthState {
  ranAt: string;
  results: HealthCheckResult[];
  /** Failing checks, sorted and joined; empty when everything passes. */
  signature: string;
  /** When the owner was last told about `signature`. */
  alertedAt: string | null;
}

export interface HealthCheckDeps {
  /** The API in this Worker, called in-process (`app.fetch`). */
  fetchApi(path: string, init?: RequestInit): Promise<Response>;
  /** Everything outside this Worker: the public site, Apple. */
  fetchExternal?: typeof fetch;
  sendSilentPush?(deviceToken: string, config: ApnsConfig): Promise<PushResult>;
  alert?: typeof notifyAdmins;
  email?(env: Env, payload: NotificationPayload): Promise<number>;
  sleep?(ms: number): Promise<void>;
}

const LABEL: Record<HealthCheckName, string> = {
  feed: "Feed",
  sign_in: "Sign-in",
  push: "Push",
};

class CheckFailed extends Error {}

function fail(detail: string): never {
  throw new CheckFailed(detail);
}

/**
 * The feed as a visitor loads it: through pinkslip.work, the web Worker and
 * its binding to this API. Read-only and anonymous, so it creates nothing.
 */
async function checkFeed(deps: HealthCheckDeps): Promise<string> {
  const response = await (deps.fetchExternal ?? fetch)(`${SITE_ORIGIN}/api/v2/jobs?limit=5`, {
    headers: { accept: "application/json", "user-agent": "Pinkslip-HealthCheck/1" },
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  if (!response.ok) fail(`HTTP ${response.status}`);
  const body = await response.json().catch(() => null) as { jobs?: unknown[] } | null;
  const count = body?.jobs?.length ?? 0;
  if (count === 0) fail("The feed came back empty");
  return `${count} jobs from pinkslip.work`;
}

/**
 * Removes the guest the check made. Only a guest with no sign-in identity is
 * ever deleted, and its sessions go with it (ON DELETE CASCADE).
 */
async function deleteCheckGuest(db: D1Database, token: string): Promise<void> {
  await db.prepare(
    `DELETE FROM users
     WHERE id = (SELECT user_id FROM auth_sessions WHERE id = ? AND state = 'guest')
       AND NOT EXISTS (SELECT 1 FROM auth_identities WHERE auth_identities.user_id = users.id)`
  ).bind(token).run();
}

/**
 * A new guest session the way the iPhone app starts one, the account read
 * back with it, and Apple's signing keys, which every Apple sign-in on the
 * app and the web is verified against. Email sign-in isn't exercised: it
 * would send a real email every 15 minutes.
 */
async function checkSignIn(env: Env, deps: HealthCheckDeps): Promise<string> {
  const started = await deps.fetchApi("/api/v2/native/session", {
    method: "POST",
    headers: { "x-pinkslip-client": "ios" },
  });
  if (started.status === 401) {
    const body = await started.json().catch(() => null) as { code?: string } | null;
    if (body?.code === "access_required") return "Invite code is on; guest sign-in skipped";
  }
  if (started.status !== 201) fail(`New guest session: HTTP ${started.status}`);
  const { token } = await started.json() as { token: string };

  try {
    const me = await deps.fetchApi("/api/v2/me", {
      headers: { authorization: `Bearer ${token}`, "x-pinkslip-client": "ios" },
    });
    if (!me.ok) fail(`Account: HTTP ${me.status}`);
    const account = await me.json() as { session?: { state?: string } };
    if (account.session?.state !== "guest") fail("The account didn't load the new session");
  } finally {
    await deleteCheckGuest(env.DB, token).catch((error: unknown) =>
      recordError(env.DB, { source: "cron", route: "health:sign_in", ...describeThrown(error) })
    );
  }

  const keys = await (deps.fetchExternal ?? fetch)("https://appleid.apple.com/auth/keys", {
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  if (!keys.ok) fail(`Apple's sign-in keys: HTTP ${keys.status}`);
  const jwks = await keys.json().catch(() => null) as { keys?: unknown[] } | null;
  if (!jwks?.keys?.length) fail("Apple returned no sign-in keys");
  return "Guest session, account and Apple's keys";
}

/**
 * A silent push to an admin's iPhone: nothing shows, but APNs has to accept
 * our provider token and a live device token, as it does for every alert.
 */
async function checkPush(env: Env, deps: HealthCheckDeps): Promise<string> {
  const config = resolveApnsConfig(env);
  if (!config) fail("APNs isn't configured");
  const device = await env.DB.prepare(
    `SELECT ps.endpoint
     FROM push_subscriptions ps
     JOIN users u ON u.id = ps.user_id
     WHERE u.role = 'admin' AND ps.platform = 'ios'
     ORDER BY ps.created_at DESC
     LIMIT 1`
  ).first<{ endpoint: string }>();
  if (!device) fail("No admin iPhone is registered for push");
  const result = await (deps.sendSilentPush ?? sendApnsBackgroundPush)(device.endpoint, config);
  if (!result.ok) {
    const reason = apnsReason(result.body) ?? result.error ?? "no reason given";
    fail(`APNs ${result.status ?? 0}: ${reason}`);
  }
  return "APNs accepted a silent push";
}

async function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new CheckFailed(`No answer in ${CHECK_TIMEOUT_MS / 1000}s`)), CHECK_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function runOnce(name: HealthCheckName, check: () => Promise<string>): Promise<HealthCheckResult> {
  const startedAt = Date.now();
  try {
    const detail = await withTimeout(check());
    return { name, ok: true, detail, ms: Date.now() - startedAt };
  } catch (error) {
    const detail = error instanceof CheckFailed ? error.message : describeThrown(error).message;
    return { name, ok: false, detail, ms: Date.now() - startedAt };
  }
}

/** A failure is tried once more before it counts, so one dropped request doesn't page. */
async function runWithRetry(
  name: HealthCheckName,
  check: () => Promise<string>,
  sleep: (ms: number) => Promise<void>
): Promise<HealthCheckResult> {
  const first = await runOnce(name, check);
  if (first.ok) return first;
  await sleep(RETRY_DELAY_MS);
  return runOnce(name, check);
}

export function buildHealthAlertPayload(
  failing: HealthCheckResult[],
  stillFailing: boolean
): NotificationPayload {
  const verb = stillFailing ? "still failing" : "failed";
  if (failing.length === 1) {
    const [check] = failing;
    return {
      title: `${LABEL[check!.name]} check ${verb}`,
      body: check!.detail,
      data: { url: "/admin" },
    };
  }
  return {
    title: `${failing.length} checks ${verb}`,
    body: failing.map((check) => `${LABEL[check.name]}: ${check.detail}`).join(" · "),
    data: { url: "/admin" },
  };
}

export const HEALTH_RECOVERED_PAYLOAD: NotificationPayload = {
  title: "Checks pass again",
  body: "Feed, sign-in and push all work.",
  data: { url: "/admin" },
};

/** Admins' verified sign-in emails: the way to reach the owner when push is down. */
export async function emailAdmins(env: Env, payload: NotificationPayload): Promise<number> {
  const fromEmail = env.EMAIL_FROM_ADDRESS?.trim();
  if (!env.EMAIL || !fromEmail) return 0;
  const rows = await env.DB.prepare(
    `SELECT DISTINCT lower(ai.email) AS email
     FROM auth_identities ai
     JOIN users u ON u.id = ai.user_id
     WHERE u.role = 'admin' AND ai.email IS NOT NULL AND ai.email_verified = 1`
  ).all<{ email: string }>();
  let sent = 0;
  for (const { email } of rows.results ?? []) {
    try {
      await env.EMAIL.send({
        to: email,
        from: { email: fromEmail, name: env.EMAIL_FROM_NAME?.trim() || "Pinkslip" },
        subject: payload.title,
        text: `${payload.body}\n\n${SITE_ORIGIN}${payload.data.url}\n`,
      });
      sent += 1;
    } catch (error) {
      console.error("Health alert email failed:", describeThrown(error).message);
    }
  }
  return sent;
}

async function loadState(db: D1Database): Promise<HealthState | null> {
  const row = await db.prepare("SELECT value FROM preferences WHERE key = ?")
    .bind(STATE_KEY)
    .first<{ value: string }>();
  try {
    return row ? JSON.parse(row.value) as HealthState : null;
  } catch {
    return null;
  }
}

export async function loadHealthState(db: D1Database): Promise<HealthState | null> {
  return loadState(db);
}

/**
 * Runs the three checks and tells the owner when something starts failing,
 * when a different set fails, every 6 hours while it lasts, and once when
 * everything passes again.
 */
export async function runHealthChecks(
  env: Env,
  deps: HealthCheckDeps,
  now = new Date()
): Promise<HealthState> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const results = await Promise.all([
    runWithRetry("feed", () => checkFeed(deps), sleep),
    runWithRetry("sign_in", () => checkSignIn(env, deps), sleep),
    runWithRetry("push", () => checkPush(env, deps), sleep),
  ]);

  const failing = results.filter((result) => !result.ok);
  const signature = failing.map((result) => result.name).sort().join(",");
  const previous = await loadState(env.DB);
  const previousSignature = previous?.signature ?? "";
  let alertedAt = signature && signature === previousSignature ? previous?.alertedAt ?? null : null;

  const tell = async (payload: NotificationPayload, emailToo: boolean) => {
    const pushed = await (deps.alert ?? notifyAdmins)(env.DB, env, payload).catch(() => 0);
    if (pushed === 0 || emailToo) await (deps.email ?? emailAdmins)(env, payload).catch(() => 0);
  };

  const lastAlert = previous?.alertedAt && previousSignature
    ? { signature: previousSignature, alertedAt: previous.alertedAt }
    : null;
  if (signature && shouldAlert(signature, lastAlert, now)) {
    await tell(
      buildHealthAlertPayload(failing, signature === previousSignature),
      failing.some((result) => result.name === "push")
    );
    alertedAt = now.toISOString();
  } else if (!signature && previousSignature) {
    await tell(HEALTH_RECOVERED_PAYLOAD, previousSignature.split(",").includes("push"));
  }

  const state: HealthState = { ranAt: now.toISOString(), results, signature, alertedAt };
  await env.DB.prepare(
    `INSERT INTO preferences (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).bind(STATE_KEY, JSON.stringify(state)).run();
  return state;
}
