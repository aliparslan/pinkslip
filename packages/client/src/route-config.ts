export type AppShell = "consumer" | "admin";
export type RootDestination = "feed" | "library" | "you";

export interface RouteDefinition {
  id: string;
  pattern: string;
  shell: AppShell;
  depth: number;
  rootDestination?: RootDestination;
  showRootNavigation?: boolean;
  rootHeaderTitle?: string;
  rootHeaderSubtitle?: string;
  documentTitle?: string;
}

export const routeDefinitions: RouteDefinition[] = [
  { id: "feed", pattern: "/", shell: "consumer", depth: 0, rootDestination: "feed", showRootNavigation: true, rootHeaderTitle: "Jobs" },
  { id: "job", pattern: "/jobs/:jobId", shell: "consumer", depth: 1, rootDestination: "feed" },
  { id: "tailor", pattern: "/tailor/:jobId", shell: "consumer", depth: 2, rootDestination: "feed" },
  { id: "library-saved", pattern: "/library/saved", shell: "consumer", depth: 0, rootDestination: "library", showRootNavigation: true, rootHeaderTitle: "Library", documentTitle: "Library · Saved" },
  { id: "library-applied", pattern: "/library/applied", shell: "consumer", depth: 0, rootDestination: "library", showRootNavigation: true, rootHeaderTitle: "Library", documentTitle: "Library · Applied" },
  { id: "you", pattern: "/you", shell: "consumer", depth: 0, rootDestination: "you", showRootNavigation: true, rootHeaderTitle: "You" },
  { id: "you-preferences", pattern: "/you/preferences", shell: "consumer", depth: 1, rootDestination: "you" },
  { id: "you-alerts", pattern: "/you/alerts", shell: "consumer", depth: 1, rootDestination: "you" },
  { id: "you-companies", pattern: "/you/companies", shell: "consumer", depth: 1, rootDestination: "you" },
  { id: "you-resume", pattern: "/you/resume", shell: "consumer", depth: 1, rootDestination: "you" },
  { id: "you-tailoring", pattern: "/you/tailoring", shell: "consumer", depth: 1, rootDestination: "you" },
  { id: "you-answers", pattern: "/you/answers", shell: "consumer", depth: 1, rootDestination: "you" },
  { id: "you-account", pattern: "/you/account", shell: "consumer", depth: 1, rootDestination: "you" },
  { id: "you-feedback", pattern: "/you/feedback", shell: "consumer", depth: 1, rootDestination: "you" },
  { id: "admin-overview", pattern: "/admin", shell: "admin", depth: 1, rootDestination: "you", documentTitle: "Admin · Manage" },
  { id: "admin-inbox", pattern: "/admin/inbox", shell: "admin", depth: 1, rootDestination: "you", documentTitle: "Admin · Inbox" },
  { id: "admin-sources", pattern: "/admin/sources", shell: "admin", depth: 1, rootDestination: "you", documentTitle: "Admin · Sources" },
  { id: "admin-runs", pattern: "/admin/runs", shell: "admin", depth: 1, rootDestination: "you", documentTitle: "Admin · Runs" },
  { id: "admin-jev", pattern: "/admin/jev", shell: "admin", depth: 1, rootDestination: "you", documentTitle: "Admin · Jev" },
];

const compatibilityRedirects: Record<string, string> = {
  "/library": "/library/saved",
  "/my-jobs/saved": "/library/saved",
  "/my-jobs/applied": "/library/applied",
  "/profile": "/you",
  "/settings": "/you",
  "/companies": "/you/companies",
  "/resume": "/you/resume",
  "/you/operations": "/admin",
};

export function routePath(route: string): string {
  const withoutHashPrefix = route.startsWith("#") ? route.slice(1) : route;
  const path = withoutHashPrefix.split("?")[0] || "/";
  const rootedPath = path.startsWith("/") ? path : `/${path}`;
  return rootedPath.replace(/\/+$/, "") || "/";
}

function routeQuery(route: string): string {
  const queryIndex = route.indexOf("?");
  return queryIndex >= 0 ? route.slice(queryIndex + 1) : "";
}

function matchesPattern(route: string, pattern: string): boolean {
  const routeParts = routePath(route).split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);
  if (routeParts.length !== patternParts.length) return false;
  return patternParts.every((part, index) => part.startsWith(":") || part === routeParts[index]);
}

export function normalizeRoute(route: string): string {
  const raw = route.trim() || "/";
  const path = routePath(raw);
  const canonicalPath = compatibilityRedirects[path] ?? path;
  const query = routeQuery(raw);
  return `${canonicalPath}${query ? `?${query}` : ""}`;
}

export function initialRouteForLocation(hash: string, pathname: string): string {
  const hashRoute = hash.startsWith("#") ? hash.slice(1) : hash;
  return normalizeRoute(hashRoute || pathname || "/");
}

/**
 * Resolve a web URL, including the one-time migration from the legacy
 * `/#/route` format. Query parameters that lived before the hash (for example
 * the email sign-in result) are carried onto the clean route.
 */
export function initialHistoryRouteForLocation(
  hash: string,
  pathname: string,
  search = "",
): string {
  const legacyRoute = hash.startsWith("#/") ? hash.slice(1) : "";
  if (!legacyRoute) return normalizeRoute(`${pathname || "/"}${search}`);

  const legacyPath = routePath(legacyRoute);
  const legacyQuery = routeQuery(legacyRoute);
  const outerQuery = search.startsWith("?") ? search.slice(1) : search;
  const query = [outerQuery, legacyQuery].filter(Boolean).join("&");
  return normalizeRoute(`${legacyPath}${query ? `?${query}` : ""}`);
}

export function routeDefinition(route: string): RouteDefinition {
  const normalized = normalizeRoute(route);
  return routeDefinitions.find((definition) => matchesPattern(normalized, definition.pattern))
    ?? routeDefinitions[0];
}

export function routeDepth(route: string): number {
  return routeDefinition(route).depth;
}

export function routeShell(route: string): AppShell {
  return routeDefinition(route).shell;
}

export function rootDestinationFor(route: string): RootDestination | null {
  return routeDefinition(route).rootDestination ?? null;
}

export function showsRootNavigation(route: string): boolean {
  return routeDefinition(route).showRootNavigation === true;
}

export function rootHeaderFor(route: string): { title: string; subtitle: string } | null {
  const definition = routeDefinition(route);
  return definition.rootHeaderTitle
    ? { title: definition.rootHeaderTitle, subtitle: definition.rootHeaderSubtitle ?? "" }
    : null;
}

export function documentTitleFor(route: string): string | null {
  return routeDefinition(route).documentTitle ?? null;
}

export function routeParam(route: string, name: string): string | null {
  const definition = routeDefinition(route);
  const routeParts = routePath(normalizeRoute(route)).split("/").filter(Boolean);
  const patternParts = definition.pattern.split("/").filter(Boolean);
  const index = patternParts.indexOf(`:${name}`);
  return index >= 0 ? routeParts[index] ?? null : null;
}
