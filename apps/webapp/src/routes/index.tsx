import { createFileRoute, Link } from "@tanstack/react-router";
import { loadPublicJobs } from "../platform/public-jobs";
import styles from "../styles/Jobs.module.css";

export const Route = createFileRoute("/")({
  loader: () => loadPublicJobs(),
  component: Jobs,
});

function Jobs() {
  const { jobs } = Route.useLoaderData();
  return <section>
    <h1>Jobs</h1>
    <p className={styles.intro}>Early-career opportunities, straight from company career pages.</p>
    {jobs.length === 0
      ? <p>No openings to show right now. Check back soon.</p>
      : <ul className={styles.list}>{jobs.map((job) =>
        <li key={job.id}>
          <Link to="/jobs/$jobId" params={{ jobId: job.id }} className={styles.job}>
            <span className={styles.company}>{job.company_name}</span>
            <span className={styles.title}>{job.title}</span>
            <span className={styles.meta}>{job.location}</span>
          </Link>
        </li>
      )}</ul>}
  </section>;
}
