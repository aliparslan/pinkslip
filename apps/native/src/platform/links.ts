import { WEB_URL } from "./session";

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
  if (url.protocol !== "pinkslip:" && !["pinkslip.work", "pinkslip.alip.dev", new URL(WEB_URL).hostname].includes(host)) return null;
  const path = url.protocol === "pinkslip:" ? `/${url.host}${url.pathname}`.replace(/\/$/, "") || "/" : url.pathname;
  const job = /^\/jobs\/([^/]+)\/?$/.exec(path);
  if (job) return `/jobs/${job[1]}${url.search}`;
  if (path === "/auth/email/verify") return `/auth/email/verify${url.search}`;
  if (path === "/" || path === "") return "/";
  if (path.startsWith("/library")) return path.includes("applied") ? "/library?view=applied" : "/library";
  if (path === "/you" || path.startsWith("/you/")) return path;
  return null;
}
