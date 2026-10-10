import type { PageMetadata } from "./pages";

/** Only the two known Library origins affect a job's destination. */
export function jobRoot(search: Record<string, unknown>): "/" | "/library/saved" | "/library/applied" {
  if (search.from === "library-saved") return "/library/saved";
  if (search.from === "library-applied") return "/library/applied";
  return "/";
}

export function backTarget(page: PageMetadata, pathname: string, search: Record<string, unknown>): string {
  if (pathname.startsWith("/tailor/")) {
    const jobId = pathname.slice("/tailor/".length);
    const origin = jobRoot(search);
    return `/jobs/${jobId}${origin === "/" ? "" : `?from=${origin === "/library/saved" ? "library-saved" : "library-applied"}`}`;
  }
  if (page.root === "jobs") return jobRoot(search);
  if (page.shell === "admin" && pathname !== "/admin" && pathname !== "/admin/") return "/admin";
  return "/you";
}
