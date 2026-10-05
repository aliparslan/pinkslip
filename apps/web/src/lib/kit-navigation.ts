import { normalizeRoute } from "../../../../packages/client/src/route-config";
import type {
  NavigationAdapter,
  NavigationChange,
  NavigationHistoryState,
  NavigationLocation,
} from "../../../../packages/client/src/router";

interface KitNavigationPort {
  current(): NavigationLocation;
  goto(route: string, options: {
    replace: boolean;
    reset: false;
    state: NavigationHistoryState;
  }): Promise<void>;
  replaceState(route: string, state: NavigationHistoryState): void;
  back(): void;
  onError(error: unknown): void;
}

/** Shared feature navigation delegates to Kit; it never writes browser history directly. */
export function createKitNavigationAdapter(port: KitNavigationPort) {
  const listeners = new Set<(change: NavigationChange) => void>();
  let lastRoute = port.current().route;
  let pending: { route: string; type: "push" | "replace" } | undefined;
  let settled = Promise.resolve();
  const go = (route: string, state: NavigationHistoryState, replaceState: boolean) => {
    const target = normalizeRoute(route);
    pending = { route: target, type: replaceState ? "replace" : "push" };
    settled = port.goto(target, {
      replace: replaceState, state, reset: false,
    }).catch((error) => {
      if (pending?.route === target) pending = undefined;
      port.onError(error);
    });
  };
  const adapter: NavigationAdapter = {
    kind: "history",
    current: port.current,
    href: normalizeRoute,
    push: (route, state) => go(route, state, false),
    replace: (route, state) => go(route, state, true),
    updateState: (state) => port.replaceState("", state),
    back: port.back,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  return {
    adapter,
    settled: () => settled,
    didNavigate(type: NavigationChange["type"]) {
      const location = port.current();
      // Kit also reports shallow state changes. They must not count as route
      // changes or move focus away from a tab/heading on initial startup.
      if (location.route === lastRoute) return;
      lastRoute = location.route;
      const method = type === "pop" ? type : pending?.route === location.route ? pending.type : type;
      pending = undefined;
      for (const listener of listeners) listener({ ...location, type: method });
    },
  };
}
