import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { publicJobQueryOptions } from "@pinkslip/data";
import { JobNotFoundPage } from "../features/states/PageStates";
import styles from "../styles/Jobs.module.css";
import { pages } from "../features/navigation/pages";
import type { JobOrigin } from "../features/jobs/JobRow";

export const Route = createFileRoute("/jobs/$jobId")({
  ssr: true,
  staticData: { page: pages["/jobs/$jobId"] },
  // Library rows add their tab so Back returns there (features/navigation/back-target.ts).
  validateSearch: (search: Record<string, unknown>): { from?: JobOrigin } =>
    search.from === "library-saved" || search.from === "library-applied" ? { from: search.from } : {},
  loader: async ({ context, params }) => {
    const job = await context.queryClient.ensureQueryData(publicJobQueryOptions(context.api, params.jobId));
    if (!job) throw notFound();
    return job;
  },
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.title} at ${loaderData.company_name} · Pinkslip` : "Job not found · Pinkslip" }] }),
  component: Job,
  notFoundComponent: JobNotFoundPage,
});

function Job() {
  const { api } = Route.useRouteContext();
  const { jobId } = Route.useParams();
  const { data: job } = useSuspenseQuery(publicJobQueryOptions(api, jobId));
  if (!job) throw notFound();
  return <article>
    <p className={styles.company}>{job.company_name}</p>
    <h1>{job.title}</h1>
    <p className={styles.meta}>{job.location}</p>
    {job.salary && <p>{job.salary}</p>}
    <a href={job.url} target="_blank" rel="noopener noreferrer">View on company website</a>
  </article>;
}
