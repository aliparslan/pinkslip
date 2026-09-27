import { derived, writable } from "svelte/store";
import {
  jobOriginFromNavigationState,
  jobOriginFromRoute,
  jobReturnRoute,
  navigationStateWithJobOrigin,
  withJobOrigin,
} from "./lib/job-navigation";
import {
  initialHistoryRouteForLocation,
  initialRouteForLocation,
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

export type NavigationKind = "history" | "hash";
export type NavigationChangeType = "push" | "replace" | "pop";
export type NavigationHistoryState = Record<string, unknown>;

export interface NavigationLocation {
  route: string;
  state: NavigationHistoryState;
}

export interface NavigationChange extends NavigationLocation {
  type: NavigationChangeType;
}

/** Platform-owned URL behavior injected before the application mounts. */
export interface NavigationAdapter {
  readonly kind: NavigationKind;
  current(): NavigationLocation;
  href(route: string): string;
  push(route: string, state: NavigationHistoryState): void;
  replace(route: string, state: NavigationHistoryState): void;
  updateState(state: NavigationHistoryState): void;
  back(): void;
  subscribe(listener: (change: NavigationChange) => void): () => void;
}

interface BrowserNavigationHost {
  readonly location: Pick<Location, "hash" | "href" | "origin" | "pathname" | "search">;
  readonly history: Pick<History, "back" | "pushState" | "replaceState" | "scrollRestoration" | "state">;
  addEventListener(type: "hashchange" | "popstate", listener: EventListener): void;
  removeEventListener(type: "hashchange" | "popstate", listener: EventListener): void;
}

function historyState(value: unknown): NavigationHistoryState {
  return value && typeof value === "object"
    ? value as NavigationHistoryState
    : {};
}

function historyLocation(host: BrowserNavigationHost): NavigationLocation {
  return {
    route: initialHistoryRouteForLocation(
      host.location.hash,
      host.location.pathname,
      host.location.search,
    ),
    state: historyState(host.history.state),
  };
}

export function createHistoryNavigationAdapter(
  host: BrowserNavigationHost = window,
): NavigationAdapter {
  const initial = historyLocation(host);
  const currentCleanUrl = `${host.location.pathname}${host.location.search}`;
  if (host.location.hash.startsWith("#/") || initial.route !== currentCleanUrl) {
    host.history.replaceState(initial.state, "", initial.route);
  }

  const listeners = new Set<(change: NavigationChange) => void>();
  const emit = (type: NavigationChangeType): void => {
    const location = historyLocation(host);
    for (const listener of listeners) listener({ ...location, type });
  };
  const onPopState: EventListener = () => emit("pop");
  const onHashChange: EventListener = () => {
    if (!host.location.hash.startsWith("#/")) return;
    const location = historyLocation(host);
    host.history.replaceState(location.state, "", location.route);
    emit("pop");
  };

  return {
    kind: "history",
    current: () => historyLocation(host),
    href: (route) => normalizeRoute(route),
    push(route, state) {
      host.history.pushState(state, "", normalizeRoute(route));
      emit("push");
    },
    replace(route, state) {
      host.history.replaceState(state, "", normalizeRoute(route));
      emit("replace");
    },
    updateState(state) {
      host.history.replaceState(state, "");
    },
    back() {
      host.history.back();
    },
    subscribe(listener) {
      if (listeners.size === 0) {
        host.addEventListener("popstate", onPopState);
        host.addEventListener("hashchange", onHashChange);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          host.removeEventListener("popstate", onPopState);
          host.removeEventListener("hashchange", onHashChange);
        }
      };
    },
  };
}

function hashUrl(host: BrowserNavigationHost, route: string): string {
  return `${host.location.pathname}${host.location.search}#${normalizeRoute(route)}`;
}

function hashLocation(host: BrowserNavigationHost): NavigationLocation {
  return {
    route: initialRouteForLocation(host.location.hash, host.location.pathname),
    state: historyState(host.history.state),
  };
}

export function createHashNavigationAdapter(
  host: BrowserNavigationHost = window,
): NavigationAdapter {
  const initial = hashLocation(host);
  const requestedHashRoute = host.location.hash.startsWith("#")
    ? host.location.hash.slice(1)
    : host.location.hash;
  if (!requestedHashRoute || normalizeRoute(requestedHashRoute) !== requestedHashRoute) {
    host.history.replaceState(initial.state, "", hashUrl(host, initial.route));
  }

  const listeners = new Set<(change: NavigationChange) => void>();
  let lastPopHref = host.location.href;
  const emit = (type: NavigationChangeType): void => {
    const location = hashLocation(host);
    for (const listener of listeners) listener({ ...location, type });
  };
  const onLocationChange: EventListener = () => {
    // Traversing hash entries can dispatch both popstate and hashchange. The
    // URL guard keeps one route update while still accepting external hashes.
    if (host.location.href === lastPopHref) return;
    lastPopHref = host.location.href;
    emit("pop");
  };

  return {
    kind: "hash",
    current: () => hashLocation(host),
    href: (route) => `#${normalizeRoute(route)}`,
    push(route, state) {
      host.history.pushState(state, "", hashUrl(host, route));
      lastPopHref = host.location.href;
      emit("push");
    },
    replace(route, state) {
      host.history.replaceState(state, "", hashUrl(host, route));
      lastPopHref = host.location.href;
      emit("replace");
    },
    updateState(state) {
      host.history.replaceState(state, "");
    },
    back() {
      host.history.back();
    },
    subscribe(listener) {
      if (listeners.size === 0) {
        host.addEventListener("popstate", onLocationChange);
        host.addEventListener("hashchange", onLocationChange);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          host.removeEventListener("popstate", onLocationChange);
          host.removeEventListener("hashchange", onLocationChange);
        }
      };
    },
  };
}

const routeStore = writable("/");
export const currentRoute = derived(routeStore, ($route) => $route || "/");

const ROUTER_STATE_KEY = "pinkslip:navigation";
interface RouterEntryState {
  scrollTop?: number;
  returnRoute?: string;
}

let adapter: NavigationAdapter | null = null;
let stopAdapter: (() => void) | null = null;
let activePath = "/";
let navigationRevision = 0;
const scrollPositions = new Map<string, number>();

/** Zero for an initial document load; increments for each client-side route change. */
export function routeNavigationRevision(): number {
  return navigationRevision;
}

function routerEntryState(state: NavigationHistoryState): RouterEntryState {
  const entry = state[ROUTER_STATE_KEY];
  return entry && typeof entry === "object" ? entry as RouterEntryState : {};
}

function withRouterEntryState(
  state: NavigationHistoryState,
  patch: Partial<RouterEntryState>,
): NavigationHistoryState {
  return {
    ...state,
    [ROUTER_STATE_KEY]: { ...routerEntryState(state), ...patch },
  };
}

function canonicalNavigationRoute(route: string): string {
  const normalized = normalizeRoute(route);
  const id = routeDefinition(normalized).id;
  if (id !== "job" && id !== "tailor") return normalized;
  return withJobOrigin(normalized, jobOriginFromRoute(normalized));
}

function usesDocumentScroll(): boolean {
  return adapter?.kind === "history"
    && document.documentElement.dataset.displayMode !== "standalone";
}

export function scrollContainer(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  if (usesDocumentScroll()) {
    return (document.scrollingElement ?? document.documentElement) as HTMLElement;
  }
  return document.getElementById("main-content");
}

function currentScrollTop(): number {
  if (typeof window === "undefined") return 0;
  return usesDocumentScroll() ? window.scrollY : (scrollContainer()?.scrollTop ?? 0);
}

function setDocumentScroll(top: number): void {
  if (typeof window === "undefined") return;
  if (usesDocumentScroll()) window.scrollTo({ top, left: 0, behavior: "auto" });
  else scrollContainer()?.scrollTo({ top, left: 0, behavior: "auto" });
}

export function savedScrollFor(path: string): number {
  const normalized = canonicalNavigationRoute(path);
  const savedForRoute = scrollPositions.get(normalized);
  if (savedForRoute !== undefined) return savedForRoute;
  if (normalized === activePath && adapter) {
    return routerEntryState(adapter.current().state).scrollTop
      ?? 0;
  }
  return 0;
}

export function restoreScrollFor(path: string): void {
  setDocumentScroll(savedScrollFor(path));
}

function requestScroll(top: number): void {
  if (typeof window === "undefined") return;
  window.requestAnimationFrame(() => setDocumentScroll(top));
}

function handleNavigationChange(change: NavigationChange): void {
  const previousPath = activePath;
  scrollPositions.set(previousPath, currentScrollTop());

  const nextPath = canonicalNavigationRoute(change.route);
  navigationRevision += 1;
  activePath = nextPath;
  routeStore.set(nextPath);

  const returning = change.type === "pop" || scrollPositions.has(nextPath);
  const nextScroll = returning ? savedScrollFor(nextPath) : 0;
  if (typeof window !== "undefined") {
    window.requestAnimationFrame(() => setDocumentScroll(nextScroll));
  }
}

export function installNavigationAdapter(nextAdapter: NavigationAdapter): () => void {
  stopAdapter?.();
  adapter = nextAdapter;

  let initial = nextAdapter.current();
  const canonicalInitialRoute = canonicalNavigationRoute(initial.route);
  if (canonicalInitialRoute !== initial.route) {
    nextAdapter.replace(canonicalInitialRoute, initial.state);
    initial = nextAdapter.current();
  }

  activePath = canonicalInitialRoute;
  routeStore.set(canonicalInitialRoute);
  const initialState = withRouterEntryState(initial.state, {
    scrollTop: routerEntryState(initial.state).scrollTop ?? 0,
  });
  nextAdapter.updateState(initialState);

  if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
    window.history.scrollRestoration = "manual";
  }
  const unsubscribe = nextAdapter.subscribe(handleNavigationChange);
  stopAdapter = unsubscribe;
  requestScroll(routerEntryState(initialState).scrollTop ?? 0);

  return () => {
    unsubscribe();
    if (stopAdapter === unsubscribe) stopAdapter = null;
    if (adapter === nextAdapter) adapter = null;
  };
}

function requireAdapter(): NavigationAdapter {
  if (!adapter) throw new Error("Navigation adapter has not been installed.");
  return adapter;
}

function announceNavigation(nextPath: string): void {
  if (adapter?.kind !== "hash" || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("pinkslip:navigation-will-change", {
    detail: { from: activePath, to: nextPath },
  }));
}

function targetRouteWithContext(path: string, state: NavigationHistoryState): string {
  let normalized = canonicalNavigationRoute(path);
  const targetDefinition = routeDefinition(normalized);
  const hasOriginQuery = new URLSearchParams(normalized.split("?")[1] ?? "")
    .has("from");

  if (targetDefinition.id === "job" && !hasOriginQuery) {
    const pendingOrigin = jobOriginFromNavigationState(state);
    if (pendingOrigin) normalized = withJobOrigin(normalized, pendingOrigin);
  } else if (targetDefinition.id === "tailor" && !hasOriginQuery) {
    const activeDefinition = routeDefinition(activePath);
    if (activeDefinition.id === "job") {
      normalized = withJobOrigin(normalized, jobOriginFromRoute(activePath));
    }
  }
  return canonicalNavigationRoute(normalized);
}

export interface NavigateOptions {
  replace?: boolean;
  state?: NavigationHistoryState;
}

export function navigationMethodFor(
  currentRoute: string,
  nextRoute: string,
  requestedReplace?: boolean,
): "push" | "replace" {
  const sameJobContext = routeDefinition(currentRoute).id === "job"
    && routeDefinition(nextRoute).id === "job"
    && jobOriginFromRoute(currentRoute) === jobOriginFromRoute(nextRoute);
  return (requestedReplace ?? sameJobContext) ? "replace" : "push";
}

export function navigate(path: string, options: NavigateOptions = {}): void {
  const navigation = requireAdapter();
  const current = navigation.current();
  const normalized = targetRouteWithContext(path, current.state);
  const replace = navigationMethodFor(activePath, normalized, options.replace) === "replace";

  if (normalized === activePath) {
    if (options.state) navigation.updateState({ ...current.state, ...options.state });
    return;
  }

  const scrollTop = currentScrollTop();
  scrollPositions.set(activePath, scrollTop);
  navigation.updateState(withRouterEntryState(current.state, { scrollTop }));
  announceNavigation(normalized);

  const origin = jobOriginFromRoute(normalized);
  const targetState = navigationStateWithJobOrigin(options.state ?? {}, origin);
  const currentEntry = routerEntryState(current.state);
  const returnRoute = replace ? currentEntry.returnRoute : activePath;
  const nextState = withRouterEntryState(targetState, {
    scrollTop: 0,
    returnRoute,
  });
  if (replace) navigation.replace(normalized, nextState);
  else navigation.push(normalized, nextState);
}

export function navigateBack(fallbackRoute?: string): boolean {
  const navigation = requireAdapter();
  const returnRoute = routerEntryState(navigation.current().state).returnRoute;
  const matchesFallback = !fallbackRoute
    || (returnRoute && canonicalNavigationRoute(returnRoute) === canonicalNavigationRoute(fallbackRoute));
  if (returnRoute && matchesFallback) {
    navigation.back();
    return true;
  }
  if (fallbackRoute) {
    navigate(fallbackRoute, { replace: true });
    return true;
  }
  return false;
}

export function routeHref(path: string): string {
  const normalized = canonicalNavigationRoute(path);
  return adapter?.href(normalized) ?? normalized;
}

export function shouldHandleRouteAnchor(event: MouseEvent): boolean {
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const anchor = event.currentTarget;
  if (!(anchor instanceof HTMLAnchorElement)) return false;
  if (anchor.download || (anchor.target && anchor.target !== "_self")) return false;
  const destination = new URL(anchor.href, window.location.href);
  return destination.origin === window.location.origin;
}

export function navigateFromAnchor(
  event: MouseEvent,
  path: string,
  options: NavigateOptions = {},
): boolean {
  if (!shouldHandleRouteAnchor(event)) return false;
  event.preventDefault();
  navigate(path, options);
  return true;
}

export function backTargetRoute(route: string): string | null {
  const definition = routeDefinition(route);
  if (definition.id === "tailor") {
    const id = routeParam(route, "jobId");
    return id
      ? withJobOrigin(`/jobs/${id}`, jobOriginFromRoute(route))
      : "/";
  }
  if (definition.id === "job") return jobReturnRoute(jobOriginFromRoute(route));
  if (definition.rootDestination === "you" && definition.depth > 0) return "/you";
  return null;
}
