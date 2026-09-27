import { describe, expect, test } from "bun:test";
import {
  createHashNavigationAdapter,
  createHistoryNavigationAdapter,
  navigationMethodFor,
} from "../src/router";
import {
  jobDetailRoute,
  jobOriginForListRoute,
  jobOriginFromRoute,
  jobReturnRoute,
  navigationStateWithJobOrigin,
} from "../src/lib/job-navigation";

class FakeNavigationHost {
  location = {
    hash: "",
    href: "https://pinkslip.example/",
    origin: "https://pinkslip.example",
    pathname: "/",
    search: "",
  };

  private historyState: unknown = null;
  private listeners = new Map<string, Set<EventListener>>();
  backCount = 0;

  history = {
    state: null as unknown,
    scrollRestoration: "auto" as ScrollRestoration,
    pushState: (state: unknown, _unused: string, url?: string | URL | null) => {
      this.historyState = state;
      if (url != null) this.applyUrl(String(url));
    },
    replaceState: (state: unknown, _unused: string, url?: string | URL | null) => {
      this.historyState = state;
      if (url != null) this.applyUrl(String(url));
    },
    back: () => {
      this.backCount += 1;
    },
  };

  constructor(path = "/") {
    Object.defineProperty(this.history, "state", { get: () => this.historyState });
    this.applyUrl(path);
  }

  addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  private applyUrl(rawUrl: string): void {
    const url = new URL(rawUrl, this.location.href);
    this.location.href = url.href;
    this.location.origin = url.origin;
    this.location.pathname = url.pathname;
    this.location.search = url.search;
    this.location.hash = url.hash;
  }
}

describe("frontend navigation adapters", () => {
  test("migrates legacy hashes and emits clean History API navigation", () => {
    const host = new FakeNavigationHost("/?auth=email-success#/settings");
    const adapter = createHistoryNavigationAdapter(host as never);
    expect(host.location.pathname + host.location.search + host.location.hash)
      .toBe("/you?auth=email-success");
    expect(adapter.current().route).toBe("/you?auth=email-success");
    expect(adapter.href("/library/")).toBe("/library/saved");

    const changes: string[] = [];
    const unsubscribe = adapter.subscribe((change) => changes.push(`${change.type}:${change.route}`));
    adapter.push("/jobs/job_123?from=library-saved", { marker: 1 });
    expect(host.location.pathname + host.location.search).toBe("/jobs/job_123?from=library-saved");
    expect(changes).toEqual(["push:/jobs/job_123?from=library-saved"]);
    unsubscribe();
  });

  test("keeps Capacitor navigation in the document hash", () => {
    const host = new FakeNavigationHost("/");
    const adapter = createHashNavigationAdapter(host as never);
    expect(host.location.hash).toBe("#/");
    expect(adapter.href("/you/account")).toBe("#/you/account");

    const changes: string[] = [];
    adapter.subscribe((change) => changes.push(`${change.type}:${change.route}`));
    adapter.push("/you/account", { marker: 1 });
    expect(host.location.pathname + host.location.hash).toBe("/#/you/account");
    expect(changes).toEqual(["push:/you/account"]);
  });
});

describe("job navigation context", () => {
  test("pushes the first selection and replaces subsequent comparisons", () => {
    expect(navigationMethodFor("/", "/jobs/one")).toBe("push");
    expect(navigationMethodFor("/jobs/one", "/jobs/two")).toBe("replace");
    expect(navigationMethodFor(
      "/jobs/one?from=library-saved",
      "/jobs/two?from=library-applied",
    )).toBe("push");
  });

  test("uses a validated URL origin and defaults direct links to Jobs", () => {
    expect(jobOriginForListRoute("/library/saved?sort=recent")).toBe("library-saved");
    expect(jobDetailRoute("job 123", "library-applied"))
      .toBe("/jobs/job%20123?from=library-applied");
    expect(jobOriginFromRoute("/jobs/job_123?from=anything-else")).toBe("feed");
    expect(jobReturnRoute(jobOriginFromRoute("/jobs/job_123"))).toBe("/");
    expect(jobReturnRoute(jobOriginFromRoute("/jobs/job_123?from=library-saved")))
      .toBe("/library/saved");
  });

  test("persists origin in session-history state without module-global return state", () => {
    const state = navigationStateWithJobOrigin({ scroll: 420 }, "library-applied");
    expect(state.scroll).toBe(420);
    expect(state["pinkslip:job-origin"]).toBe("library-applied");
  });
});
