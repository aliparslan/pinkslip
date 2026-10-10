import { redirect } from "@tanstack/react-router";

export const compatibilityRedirects = {
  "/library": "/library/saved",
  "/my-jobs/saved": "/library/saved",
  "/my-jobs/applied": "/library/applied",
  "/profile": "/you",
  "/settings": "/you",
  "/companies": "/you/companies",
  "/resume": "/you/resume",
  "/you/operations": "/admin",
} as const;

/** Fixed destinations only; retain email results, job origins and anchors. */
export function redirectLegacyPath(path: keyof typeof compatibilityRedirects, location: { searchStr: string; hash: string }) {
  throw redirect({
    href: `${compatibilityRedirects[path]}${location.searchStr}${location.hash ? `#${location.hash}` : ""}`,
    statusCode: 308,
    replace: true,
  });
}

/** Fragments never reach SSR. Migrate them after hydration without adding a
 * history entry. Ordinary anchors stay intact; protocol-relative URLs cannot
 * become redirect targets. Duplicate query values retain their original order. */
export function legacyHashTarget(hash: string, search: string): string | null {
  if (!hash.startsWith("#/")) return null;
  const raw = hash.slice(1);
  const separator = raw.indexOf("?");
  const path = (separator < 0 ? raw : raw.slice(0, separator)).replace(/\/+$/, "") || "/";
  if (path.startsWith("//") || path.includes("\\") || /[\u0000-\u0020]/.test(path)) return null;
  const canonical = compatibilityRedirects[path as keyof typeof compatibilityRedirects] ?? path;
  const query = [search.replace(/^\?/, ""), separator < 0 ? "" : raw.slice(separator + 1)].filter(Boolean).join("&");
  return `${canonical}${query ? `?${query}` : ""}`;
}
