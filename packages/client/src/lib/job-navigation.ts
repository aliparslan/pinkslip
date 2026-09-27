import { routePath } from "../route-config";

export type JobOrigin = "feed" | "library-saved" | "library-applied";

export const JOB_ORIGIN_QUERY_PARAM = "from";
const JOB_ORIGIN_STATE_KEY = "pinkslip:job-origin";

function isJobOrigin(value: unknown): value is JobOrigin {
  return value === "feed" || value === "library-saved" || value === "library-applied";
}

export function jobOriginFromRoute(route: string): JobOrigin {
  const queryIndex = route.indexOf("?");
  if (queryIndex < 0) return "feed";
  const origin = new URLSearchParams(route.slice(queryIndex + 1)).get(JOB_ORIGIN_QUERY_PARAM);
  return isJobOrigin(origin) ? origin : "feed";
}

export function jobOriginForListRoute(route: string): JobOrigin {
  const path = routePath(route);
  if (path === "/library/saved") return "library-saved";
  if (path === "/library/applied") return "library-applied";
  return "feed";
}

export function jobReturnRoute(origin: JobOrigin): string {
  if (origin === "library-saved") return "/library/saved";
  if (origin === "library-applied") return "/library/applied";
  return "/";
}

export function withJobOrigin(route: string, origin: JobOrigin): string {
  const [path, rawQuery = ""] = route.split("?", 2);
  const query = new URLSearchParams(rawQuery);
  if (origin === "feed") query.delete(JOB_ORIGIN_QUERY_PARAM);
  else query.set(JOB_ORIGIN_QUERY_PARAM, origin);
  const suffix = query.toString();
  return `${path || "/"}${suffix ? `?${suffix}` : ""}`;
}

export function jobDetailRoute(jobId: string, origin: JobOrigin = "feed"): string {
  return withJobOrigin(`/jobs/${encodeURIComponent(jobId)}`, origin);
}

export function jobOriginFromNavigationState(state: unknown): JobOrigin | null {
  if (!state || typeof state !== "object") return null;
  const origin = (state as Record<string, unknown>)[JOB_ORIGIN_STATE_KEY];
  return isJobOrigin(origin) ? origin : null;
}

export function navigationStateWithJobOrigin(
  state: unknown,
  origin: JobOrigin,
): Record<string, unknown> {
  const current = state && typeof state === "object"
    ? state as Record<string, unknown>
    : {};
  return { ...current, [JOB_ORIGIN_STATE_KEY]: origin };
}
