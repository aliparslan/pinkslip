import { Hono } from "hono";
import { buildToday, markTodaySeen } from "../activity";
import type { Env, Variables } from "../types";

/**
 * Today in one request, with the app's rules (worker/activity.ts), and the
 * seen mark that opening Today sets on every device.
 */
const today = new Hono<{ Bindings: Env; Variables: Variables }>();

today.get("/", async (c) => c.json(await buildToday(c.env.DB, c.get("userId"))));

today.post("/seen", async (c) => c.json({ seen_at: await markTodaySeen(c.env.DB, c.get("userId")) }));

export default today;
