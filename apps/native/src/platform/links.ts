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
  // `?answer=sends` opens the stopped sends' sheet.
  if (path === "/today") return `/today${url.search}`;
  const application = /^\/applications\/([^/]+)\/?$/.exec(path);
  if (application) return `/applications/${application[1]}`;
  // An event reminder (N19) opens the event's page.
  const event = /^\/events\/([^/]+)\/?$/.exec(path);
  if (event) return `/events/${event[1]}`;
  if (/^\/library(?:\/(?:saved|applied))?\/?$/.test(path)) return path.includes("applied") || url.searchParams.get("view") === "applied" ? "/library?view=applied" : "/library";
  if (path === "/you" || path.startsWith("/you/")) return path;
  // Admin alerts link to the web admin; the app has its own.
  const admin = /^\/admin(\/(?:inbox|runs|sources|jev))?\/?$/.exec(path);
  if (admin) return `/you/admin${admin[1] ?? ""}`;
  return null;
}

/**
 * A page opened as the app starts has no tab to open in, and the router
 * would pick any stack that has it: Back from a job landed on Search. So it
 * opens in its home tab, on top of that tab's list (owner, Nov 8).
 */
export function inHomeTab(path: string): string {
  if (path.startsWith("/jobs/")) return `/(tabs)/(jobs)${path}`;
  if (path.startsWith("/applications/")) return `/(tabs)/(library)${path}`;
  if (path.startsWith("/events/")) return `/(tabs)/(today)${path}`;
  return path;
}

/** Expo Router's note on a page opened by a zoom: the row it grew from. */
export const ZOOM_SOURCE = "__internal_expo_router_zoom_transition_source_id";

/** Names a row to zoom out of: the same from a tap on it and from an alert. */
export function rowZoomId(tab: string, id: string): string {
  return `${tab.replace(/[()]/g, "")}-${id}`;
}

/** Has a page an alert opened zoom like a tapped row's. */
export function fromAlert(path: string): string {
  const page = /^\/(?:jobs|applications|events)\/([^/?]+)/.exec(path);
  const tab = homeTabOf(path);
  if (!page || !tab) return path;
  return `${path}${path.includes("?") ? "&" : "?"}${ZOOM_SOURCE}=${rowZoomId(tab.slice(tab.lastIndexOf("/") + 1), page[1]!)}`;
}

/** The tab a page belongs to, when it has one. */
export function homeTabOf(path: string): string | null {
  const home = inHomeTab(path);
  return home === path ? null : home.slice(0, home.indexOf(")", home.indexOf(")") + 1) + 1);
}
