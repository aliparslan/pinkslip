import { writable, derived } from "svelte/store";
import { getJobDetailReturnRoute } from "./lib/job-navigation";
import {
  normalizeRoute,
  rootDestinationFor,
  rootHeaderFor,
  routeDefinition,
  routeDepth,
  routeParam,
  routeShell,
  showsRootNavigation,
} from "./route-config";

export {
  normalizeRoute,
  rootDestinationFor,
  rootHeaderFor,
  routeDefinition,
  routeDepth,
  routeParam,
  routeShell,
  showsRootNavigation,
};
export type { AppShell, RootDestination, RouteDefinition } from "./route-config";

const rawInitialPath = window.location.hash.slice(1) || "/";
const initialPath = normalizeRoute(rawInitialPath);
if (initialPath !== rawInitialPath) {
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}#${initialPath}`);
}

const hash = writable(initialPath);
const scrollPositions = new Map<string, number>();
let activePath = initialPath;
let pendingScrollSnapshot: { path: string; top: number } | null = null;

export function scrollContainer(): HTMLElement | null {
  return document.getElementById("main-content");
}

function currentScrollTop(): number {
  return scrollContainer()?.scrollTop ?? 0;
}

function setDocumentScroll(top: number) {
  scrollContainer()?.scrollTo({ top, left: 0, behavior: "auto" });
}

export function savedScrollFor(path: string): number {
  return scrollPositions.get(normalizeRoute(path)) ?? 0;
}

export function restoreScrollFor(path: string) {
  setDocumentScroll(savedScrollFor(path));
}

if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

window.addEventListener("hashchange", () => {
  const requestedPath = window.location.hash.slice(1) || "/";
  const nextPath = normalizeRoute(requestedPath);
  if (nextPath !== requestedPath) {
    window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}#${nextPath}`);
  }

  const previousPath = activePath;
  if (pendingScrollSnapshot?.path === previousPath) {
    scrollPositions.set(previousPath, pendingScrollSnapshot.top);
  } else {
    scrollPositions.set(previousPath, currentScrollTop());
  }
  pendingScrollSnapshot = null;
  activePath = nextPath;
  hash.set(nextPath);

  const returning = routeDepth(nextPath) < routeDepth(previousPath);
  const nextScroll = returning ? savedScrollFor(nextPath) : 0;
  window.requestAnimationFrame(() => setDocumentScroll(nextScroll));
});

window.requestAnimationFrame(() => setDocumentScroll(0));

export const currentRoute = derived(hash, ($hash) => $hash || "/");

export function navigate(path: string, options: { replace?: boolean } = {}) {
  const normalized = normalizeRoute(path);
  if (options.replace) {
    window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}#${normalized}`);
    activePath = normalized;
    hash.set(normalized);
    window.requestAnimationFrame(() => setDocumentScroll(0));
    return;
  }
  if (normalized === activePath) return;
  pendingScrollSnapshot = { path: activePath, top: currentScrollTop() };
  scrollPositions.set(activePath, currentScrollTop());
  window.location.hash = normalized;
}

export function backTargetRoute(route: string): string | null {
  const definition = routeDefinition(route);
  if (definition.id === "tailor") {
    const id = routeParam(route, "jobId");
    return id ? `/jobs/${id}` : "/";
  }
  if (definition.id === "job") return getJobDetailReturnRoute();
  if (definition.rootDestination === "you" && definition.depth > 0) return "/you";
  return null;
}
