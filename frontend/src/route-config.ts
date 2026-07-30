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
}

export const routeDefinitions: RouteDefinition[] = [
  { id: "feed", pattern: "/", shell: "consumer", depth: 0, rootDestination: "feed", showRootNavigation: true, rootHeaderTitle: "Feed" },
  { id: "job", pattern: "/jobs/:jobId", shell: "consumer", depth: 1, rootDestination: "feed" },
  { id: "tailor", pattern: "/tailor/:jobId", shell: "consumer", depth: 2, rootDestination: "feed" },
  { id: "library-saved", pattern: "/library/saved", shell: "consumer", depth: 0, rootDestination: "library", showRootNavigation: true, rootHeaderTitle: "Library" },
  { id: "library-applied", pattern: "/library/applied", shell: "consumer", depth: 0, rootDestination: "library", showRootNavigation: true, rootHeaderTitle: "Library" },
  { id: "you", pattern: "/you", shell: "consumer", depth: 0, rootDestination: "you", showRootNavigation: true, rootHeaderTitle: "You" },
  { id: "you-preferences", pattern: "/you/preferences", shell: "consumer", depth: 1, rootDestination: "you" },
  { id: "you-alerts", pattern: "/you/alerts", shell: "consumer", depth: 1, rootDestination: "you" },
  { id: "you-companies", pattern: "/you/companies", shell: "consumer", depth: 1, rootDestination: "you" },
  { id: "you-resume", pattern: "/you/resume", shell: "consumer", depth: 1, rootDestination: "you" },
  { id: "you-story", pattern: "/you/story", shell: "consumer", depth: 1, rootDestination: "you" },
  { id: "you-tailoring", pattern: "/you/tailoring", shell: "consumer", depth: 1, rootDestination: "you" },
  { id: "you-account", pattern: "/you/account", shell: "consumer", depth: 1, rootDestination: "you" },
  { id: "you-feedback", pattern: "/you/feedback", shell: "consumer", depth: 1, rootDestination: "you" },
  { id: "admin-overview", pattern: "/admin", shell: "admin", depth: 1, rootDestination: "you" },
  { id: "admin-inbox", pattern: "/admin/inbox", shell: "admin", depth: 1, rootDestination: "you" },
  { id: "admin-sources", pattern: "/admin/sources", shell: "admin", depth: 1, rootDestination: "you" },
  { id: "admin-runs", pattern: "/admin/runs", shell: "admin", depth: 1, rootDestination: "you" },
];

const compatibilityRedirects: Record<string, string> = {
  "/library": "/library/saved",
  "/my-jobs/saved": "/library/saved",
  "/my-jobs/applied": "/library/applied",
  "/profile": "/you",
  "/settings": "/you",
  "/companies": "/you/companies",
  "/resume": "/you/resume",
  "/corpus": "/you/story",
  "/you/operations": "/admin",
};

export function routePath(route: string): string {
  return (route.split("?")[0] || "/").replace(/\/+$/, "") || "/";
}

function matchesPattern(route: string, pattern: string): boolean {
  const routeParts = routePath(route).split("/").filter(Boolean);
  const patternParts = pattern.split("/").filter(Boolean);
  if (routeParts.length !== patternParts.length) return false;
  return patternParts.every((part, index) => part.startsWith(":") || part === routeParts[index]);
}

export function normalizeRoute(route: string): string {
  const raw = route || "/";
  const path = routePath(raw);
  const redirected = compatibilityRedirects[path];
  if (!redirected) return raw;
  const query = raw.includes("?") ? `?${raw.split("?").slice(1).join("?")}` : "";
  return `${redirected}${query}`;
}

export function initialRouteForLocation(hash: string, pathname: string): string {
  const hashRoute = hash.startsWith("#") ? hash.slice(1) : hash;
  return normalizeRoute(hashRoute || pathname || "/");
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

export function routeParam(route: string, name: string): string | null {
  const definition = routeDefinition(route);
  const routeParts = routePath(normalizeRoute(route)).split("/").filter(Boolean);
  const patternParts = definition.pattern.split("/").filter(Boolean);
  const index = patternParts.indexOf(`:${name}`);
  return index >= 0 ? routeParts[index] ?? null : null;
}
