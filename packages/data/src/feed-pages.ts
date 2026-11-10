import type { InfiniteData } from "@tanstack/react-query";

/** How many rows the loaded pages still hold. A job you hide or apply to leaves
 * your rows and the server's list together, so this is where the next page starts. */
export const rowsHeld = (pages: readonly { jobs: readonly unknown[] }[]) =>
  pages.reduce((held, page) => held + page.jobs.length, 0);

/** New matches can push rows you already have onto the next page. The later copy
 * goes, so a job shows once and keeps its place. */
export function withoutRepeats<Page extends { jobs: readonly { id: string }[] }, Param>(
  data: InfiniteData<Page, Param>
): InfiniteData<Page, Param> {
  const seen = new Set<string>();
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      jobs: page.jobs.filter((job) => {
        if (seen.has(job.id)) return false;
        seen.add(job.id);
        return true;
      }),
    })),
  };
}
