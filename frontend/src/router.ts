import { writable, derived } from "svelte/store";
import { getJobDetailReturnRoute } from "./lib/job-navigation";

const hash = writable(window.location.hash.slice(1) || "/");

window.addEventListener("hashchange", () => {
  hash.set(window.location.hash.slice(1) || "/");
});

export const currentRoute = derived(hash, ($hash) => $hash || "/");

export function navigate(path: string) {
  window.location.hash = path;
}

/** Navigation "depth": deeper routes are pushed over shallower ones. */
export function routeDepth(route: string): number {
  if (route.startsWith("/tailor/")) return 2;
  if (route.startsWith("/jobs/")) return 1;
  if (route.startsWith("/you/")) return 1;
  if (route.startsWith("/my-jobs/")) return 1;
  if (["/companies", "/resume", "/corpus"].includes(route)) return 1;
  return 0;
}

/** The route a back gesture / back button should return to from `route`. */
export function backTargetRoute(route: string): string | null {
  if (route.startsWith("/tailor/")) {
    const id = route.split("/tailor/")[1];
    return id ? `/jobs/${id}` : "/";
  }
  if (route.startsWith("/jobs/")) return getJobDetailReturnRoute();
  if (route.startsWith("/you/")) return "/you";
  if (route.startsWith("/my-jobs/")) return "/you";
  if (["/companies", "/resume", "/corpus"].includes(route)) return "/you";
  return null;
}
