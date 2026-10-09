import { createFileRoute, notFound } from "@tanstack/react-router";
import { loadPublicJob } from "../platform/public-jobs";
import styles from "../styles/Jobs.module.css";

export const Route = createFileRoute("/jobs/$jobId")({
  loader: async ({ params }) => {
    const job = await loadPublicJob(params.jobId);
    if (!job) throw notFound();
    return job;
  },
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${loaderData.title} at ${loaderData.company_name} · Pinkslip` : "Job not found · Pinkslip" }] }),
  component: Job,
});

function Job() {
  const job = Route.useLoaderData();
  return <article>
    <p className={styles.company}>{job.company_name}</p>
    <h1>{job.title}</h1>
    <p className={styles.meta}>{job.location}</p>
    {job.salary && <p>{job.salary}</p>}
    <a href={job.url} target="_blank" rel="noopener noreferrer">View on company website</a>
  </article>;
}
