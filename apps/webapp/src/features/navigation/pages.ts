/** Route presentation belongs to the web shell, never to the component kit. */
export interface PageMetadata {
  title: string;
  shell: "consumer" | "admin";
  depth: number;
  root: "jobs" | "library" | "you" | null;
  /** `public` renders for everyone, including behind the access code (the
   * catalog is the API's public projection). `personal` needs a session and
   * shows the access gate when locked. `admin` also needs an admin. */
  access: "public" | "personal" | "admin";
  /** Shares the list-beside-job layout (features/split), full width on wide screens. */
  split?: boolean;
}

export const pages = {
  "/": { title: "Jobs", shell: "consumer", depth: 0, root: "jobs", access: "public", split: true },
  "/jobs/$jobId": { title: "Job", shell: "consumer", depth: 1, root: "jobs", access: "public", split: true },
  "/tailor/$jobId": { title: "Tailor resume", shell: "consumer", depth: 2, root: "jobs", access: "personal" },
  "/library/saved": { title: "Saved", shell: "consumer", depth: 0, root: "library", access: "personal", split: true },
  "/library/applied": { title: "Applied", shell: "consumer", depth: 0, root: "library", access: "personal", split: true },
  "/you": { title: "You", shell: "consumer", depth: 0, root: "you", access: "personal" },
  "/you/preferences": { title: "Job preferences", shell: "consumer", depth: 1, root: "you", access: "personal" },
  "/you/alerts": { title: "Alerts", shell: "consumer", depth: 1, root: "you", access: "personal" },
  "/you/companies": { title: "Companies", shell: "consumer", depth: 1, root: "you", access: "personal" },
  "/you/resume": { title: "Resume", shell: "consumer", depth: 1, root: "you", access: "personal" },
  "/you/tailoring": { title: "Tailoring", shell: "consumer", depth: 1, root: "you", access: "personal" },
  "/you/answers": { title: "Application answers", shell: "consumer", depth: 1, root: "you", access: "personal" },
  "/you/account": { title: "Account", shell: "consumer", depth: 1, root: "you", access: "personal" },
  "/you/feedback": { title: "Help and feedback", shell: "consumer", depth: 1, root: "you", access: "personal" },
  "/admin": { title: "Manage", shell: "admin", depth: 1, root: "you", access: "admin" },
  "/admin/inbox": { title: "Inbox", shell: "admin", depth: 1, root: "you", access: "admin" },
  "/admin/sources": { title: "Sources", shell: "admin", depth: 1, root: "you", access: "admin" },
  "/admin/runs": { title: "Runs", shell: "admin", depth: 1, root: "you", access: "admin" },
  "/admin/jev": { title: "Jev", shell: "admin", depth: 1, root: "you", access: "admin" },
  "/about": { title: "About Pinkslip", shell: "consumer", depth: 0, root: null, access: "public" },
  "/privacy": { title: "Privacy policy", shell: "consumer", depth: 0, root: null, access: "public" },
  "/support": { title: "Support", shell: "consumer", depth: 0, root: null, access: "public" },
} as const satisfies Record<string, PageMetadata>;

/** You's destinations, grouped as in the current design's secondary nav. The
 * You overview renders them as rows; wide screens also nest them in the
 * sidebar. */
export const youGroups = [
  { label: "Search", paths: ["/you/preferences", "/you/alerts", "/you/companies"] },
  { label: "Materials", paths: ["/you/resume", "/you/tailoring", "/you/answers"] },
  { label: "Pinkslip", paths: ["/you/feedback", "/you/account"] },
] as const;
export const youPages = youGroups.flatMap((group) => group.paths);
export const libraryPages = ["/library/saved", "/library/applied"] as const;
export const adminPages = ["/admin", "/admin/inbox", "/admin/sources", "/admin/runs", "/admin/jev"] as const;
export type SectionPath = typeof youPages[number] | typeof libraryPages[number] | typeof adminPages[number];

export function pageHead(page: PageMetadata) {
  const title = page.shell === "admin" ? `Admin · ${page.title}`
    : page.root === "library" ? `Library · ${page.title}` : page.title;
  return { meta: [{ title: `${title} · Pinkslip` }] };
}

declare module "@tanstack/react-router" {
  interface StaticDataRouteOption { page?: PageMetadata }
}
