import { Hono } from "hono";
import { getUserProfile, saveUserProfile } from "../account";
import type { Env, ResumeProfile, Variables } from "../types";

const profile = new Hono<{ Bindings: Env; Variables: Variables }>();

profile.get("/", async (c) => {
  const result = await getUserProfile(c.env.DB, c.get("userId"));
  return c.json({
    data: result.data,
    id: null,
    updated_at: result.updated_at,
  });
});

profile.put("/", async (c) => {
  const body = await c.req.json<{ data?: ResumeProfile }>().catch(() => null);
  if (!body?.data) {
    return c.json({ error: "Missing data field" }, 400);
  }
  if (JSON.stringify(body.data).length > 500_000) {
    return c.json({ error: "Resume profile is too large" }, 413);
  }

  const saved = await saveUserProfile(c.env.DB, c.get("userId"), body.data);
  return c.json({
    data: saved.data,
    id: null,
    updated_at: saved.updated_at,
  });
});

export default profile;
