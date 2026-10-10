import { createFileRoute, notFound } from "@tanstack/react-router";
import { publicJobQueryOptions } from "@pinkslip/data";
import { JobDetail } from "../features/job-detail/JobDetail";
import type { JobOrigin } from "../features/jobs/JobRow";
import { pages } from "../features/navigation/pages";

function summary(html: string | null | undefined): string | undefined {
  const text = html?.replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/\s+/g, " ").trim();
  return text ? (text.length > 155 ? `${text.slice(0, 154).trimEnd()}…` : text) : undefined;
}

export const Route = createFileRoute("/_split/jobs/$jobId")({
  ssr: true,
  staticData: { page: pages["/jobs/$jobId"] },
  // Library rows add their tab so Back returns there (features/navigation/back-target.ts).
  validateSearch: (search: Record<string, unknown>): { from?: JobOrigin } =>
    search.from === "library-saved" || search.from === "library-applied" ? { from: search.from } : {},
  loader: async ({ context, params }) => {
    const options = publicJobQueryOptions(context.api, params.jobId);
    // In the browser the page opens at once from the list's copy of the job
    // and fills in; only the server waits, so crawlers get the listing (or a
    // 404). A job the public catalog doesn't list may still be in a signed-in
    // person's feed: the not-found view checks their copy before giving up.
    if (typeof window !== "undefined") {
      void context.queryClient.prefetchQuery(options);
      return null;
    }
    const job = await context.queryClient.ensureQueryData(options);
    if (!job) throw notFound();
    return job;
  },
  head: ({ loaderData, params }) => {
    if (!loaderData) return { meta: [{ title: "Job · Pinkslip" }] };
    const description = summary(loaderData.description) ?? `${loaderData.title} at ${loaderData.company_name}.`;
    return {
      meta: [
        { title: `${loaderData.title} at ${loaderData.company_name} · Pinkslip` },
        { name: "description", content: description },
        { property: "og:title", content: `${loaderData.title} at ${loaderData.company_name}` },
        { property: "og:description", content: description },
      ],
      links: [{ rel: "canonical", href: `https://pinkslip.work/jobs/${encodeURIComponent(params.jobId)}` }],
    };
  },
  component: JobDetail,
  notFoundComponent: JobDetail,
});
