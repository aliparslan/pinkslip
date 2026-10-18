import { WEB_URL } from "./config";

/**
 * Maps a pinkslip.work URL (a universal link, a push's `url`, or a shared
 * link) to the app route that shows it, or null when the app has no
 * equivalent and the web should open it instead.
 */
export function appPathFor(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input, WEB_URL);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  if (url.protocol !== "pinkslip:" && (!["https:", "http:"].includes(url.protocol)
    || !["pinkslip.work", "pinkslip.alip.dev", new URL(WEB_URL).hostname].includes(host))) return null;
  const path = url.protocol === "pinkslip:" ? (url.host ? `/${url.host}${url.pathname}` : url.pathname).replace(/\/$/, "") || "/" : url.pathname;
  const job = /^\/jobs\/([^/]+)\/?$/.exec(path);
  if (job) return `/jobs/${job[1]}${url.search}`;
  if (path === "/auth/email/verify") return `/auth/email/verify${url.search}`;
  if (path === "/" || path === "") return "/";
  if (path === "/today") return "/today";
  const application = /^\/applications\/([^/]+)\/?$/.exec(path);
  if (application) return `/applications/${application[1]}`;
  if (/^\/library(?:\/(?:saved|applied))?\/?$/.test(path)) return path.includes("applied") || url.searchParams.get("view") === "applied" ? "/library?view=applied" : "/library";
  if (path === "/you" || path.startsWith("/you/")) return path;
  // Admin alerts link to the web admin; the app has its own.
  const admin = /^\/admin(\/(?:inbox|runs|sources|jev))?\/?$/.exec(path);
  if (admin) return `/you/admin${admin[1] ?? ""}`;
  return null;
}
