import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { publicJobsQueryOptions } from "@pinkslip/data";
import { Heading } from "../kit";
import styles from "../styles/Jobs.module.css";
import { pages, pageHead } from "../features/navigation/pages";

export const Route = createFileRoute("/")({
  ssr: true,
  staticData: { page: pages["/"] },
  head: () => pageHead(pages["/"]),
  loader: ({ context }) => context.queryClient.ensureQueryData(publicJobsQueryOptions(context.api)),
  component: Jobs,
});

function Jobs() {
  const { api } = Route.useRouteContext();
  const { data } = useSuspenseQuery(publicJobsQueryOptions(api));
  const { jobs } = data;
  return <section>
    <Heading level={1} variant="root">Jobs</Heading>
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
