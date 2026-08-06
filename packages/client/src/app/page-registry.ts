import type { Component } from "svelte";
import Feed from "../pages/Feed.svelte";
import JobDetail from "../pages/JobDetail.svelte";
import Profile from "../pages/Profile.svelte";
import JobLibrary from "../pages/JobLibrary.svelte";
import ResumeProfile from "../pages/ResumeProfile.svelte";

export type PageComponent = Component<{
  jobId?: string | null;
  routeOverride?: string;
}>;

type PageModule = { default: Component<never> | PageComponent };
type PageEntry =
  | { component: PageComponent; cacheKey?: never; load?: never }
  | { component?: never; cacheKey: string; load: () => Promise<PageModule> };

export const asPage = (component: Component<never> | PageComponent): PageComponent =>
  component as PageComponent;

const loadCompanies = () => import("../pages/Companies.svelte");
const loadStory = () => import("../pages/Corpus.svelte");
const loadTailor = () => import("../pages/Tailor.svelte");
const loadAdmin = () => import("../pages/Admin.svelte");

const routes: Record<string, PageEntry> = {
  "/": { component: asPage(Feed) },
  "/you": { component: asPage(Profile) },
  "/you/preferences": { component: asPage(Profile) },
  "/you/alerts": { component: asPage(Profile) },
  "/you/tailoring": { component: asPage(Profile) },
  "/you/account": { component: asPage(Profile) },
  "/you/feedback": { component: asPage(Profile) },
  "/you/companies": { cacheKey: "companies", load: loadCompanies },
  "/you/story": { cacheKey: "story", load: loadStory },
  "/you/resume": { component: asPage(ResumeProfile) },
  "/library/saved": { component: asPage(JobLibrary) },
  "/library/applied": { component: asPage(JobLibrary) },
  "/admin": { cacheKey: "admin", load: loadAdmin },
  "/admin/inbox": { cacheKey: "admin", load: loadAdmin },
  "/admin/sources": { cacheKey: "admin", load: loadAdmin },
  "/admin/runs": { cacheKey: "admin", load: loadAdmin },
};

const componentCache = new Map<string, PageComponent>();

export function entryFor(route: string): PageEntry {
  if (route.startsWith("/jobs/")) return { component: asPage(JobDetail) };
  if (route.startsWith("/tailor/")) return { cacheKey: "tailor", load: loadTailor };
  return routes[route] ?? routes["/"];
}

export function resolvedPage(route: string): PageComponent | null {
  const entry = entryFor(route);
  return entry.component ?? componentCache.get(entry.cacheKey) ?? null;
}

export async function loadPage(route: string): Promise<PageComponent> {
  const entry = entryFor(route);
  if (entry.component) return entry.component;
  const cached = componentCache.get(entry.cacheKey);
  if (cached) return cached;
  const module = await entry.load();
  const component = asPage(module.default);
  componentCache.set(entry.cacheKey, component);
  return component;
}
