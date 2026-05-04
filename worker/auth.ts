import { createMiddleware } from "hono/factory";
import type { Env, Variables } from "./types";

export const COOKIE_NAMES = {
  user: "psid",
  access: "psaccess",
} as const;

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2; // 2 years

export function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  const rawValue = match?.[1];
  if (!rawValue) return undefined;
  try {
    return decodeURIComponent(rawValue);
  } catch {
    return rawValue;
  }
}

export function buildCookie(
  name: string,
  value: string,
  requestUrl: string,
  maxAge = COOKIE_MAX_AGE
): string {
  const secure = new URL(requestUrl).protocol === "https:";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
}

export const authMiddleware = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    const pathname = new URL(c.req.url).pathname;
    if (pathname === "/api/access" || pathname === "/api/health") {
      await next();
      return;
    }

    const cookieHeader = c.req.header("cookie");
    const accessCode = c.env.ACCESS_CODE?.trim();

    if (accessCode) {
      const grantedCode = parseCookie(cookieHeader, COOKIE_NAMES.access);
      if (grantedCode !== accessCode) {
        return c.json({ error: "Access required", code: "access_required" }, 401);
      }
    }

    let userId = parseCookie(cookieHeader, COOKIE_NAMES.user);

    if (!userId) {
      userId = crypto.randomUUID();
      c.header(
        "Set-Cookie",
        buildCookie(COOKIE_NAMES.user, userId, c.req.url),
        { append: true }
      );
    }

    await c.env.DB.prepare(
      "INSERT INTO users (id) VALUES (?) ON CONFLICT (id) DO NOTHING"
    ).bind(userId).run();

    c.set("userId", userId);
    await next();
  }
);
