import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { generateApiToken } from "../auth";

const auth = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /token — Mint (or return the existing) bearer token for the current user.
// Cookie-authenticated via authMiddleware; the native app calls this once after
// its WebView session is established, then stores the token in the App Group
// Keychain so its WidgetKit / Share extensions can call the API.
auth.post("/token", async (c) => {
  const userId = c.get("userId");

  const existing = await c.env.DB.prepare(
    "SELECT token FROM api_tokens WHERE user_id = ? LIMIT 1"
  ).bind(userId).first<{ token: string }>();

  if (existing?.token) {
    return c.json({ token: existing.token });
  }

  const token = generateApiToken();
  await c.env.DB.prepare(
    "INSERT INTO api_tokens (token, user_id, created_at) VALUES (?, ?, ?)"
  ).bind(token, userId, new Date().toISOString()).run();

  return c.json({ token }, 201);
});

export default auth;
