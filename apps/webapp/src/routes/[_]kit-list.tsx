import { createFileRoute, notFound } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Heading, Stack, Text, toast, UNDO_TOAST_DURATION } from "../kit";
import { JobList } from "../features/jobs/JobList";
import { demoJobs } from "../features/jobs/demo-jobs";
import type { JobRowJob } from "../features/jobs/JobRow";
import styles from "../styles/Kit.module.css";

// Development only: 300 fixture rows to exercise the virtualized list and the
// row actions without an API (e2e/jobs.pw.ts).
export const Route = createFileRoute("/_kit-list")({
  ssr: false,
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({ meta: [{ title: "Job list demo · Pinkslip" }] }),
  component: KitList,
});

function KitList() {
  const initial = useMemo(() => demoJobs(300), []);
  const [jobs, setJobs] = useState<JobRowJob[]>(initial);
  const [viewed, setViewed] = useState<ReadonlySet<string>>(() => new Set(["demo-3"]));
  const mark = (id: string, value: boolean) => setViewed((current) => {
    const next = new Set(current);
    if (value) next.add(id);
    else next.delete(id);
    return next;
  });

  return <Stack gap="6">
    <Stack gap="2">
      <Heading level={1} variant="root">Job list</Heading>
      <Text tone="ink-3">{jobs.length} fixture jobs, virtualized.</Text>
    </Stack>
    <div className={styles.bleed}><JobList
      jobs={jobs}
      viewed={viewed}
      onOpen={(job) => mark(job.id, true)}
      actions={{
        onSave: (job) => {
          setJobs((current) => current.map((entry) => entry.id === job.id ? { ...entry, saved: true } : entry));
          toast.success("Job saved");
        },
        onToggleRead: (job, value) => mark(job.id, value),
        onHide: (job) => {
          const index = jobs.findIndex((entry) => entry.id === job.id);
          setJobs((current) => current.filter((entry) => entry.id !== job.id));
          toast.show({
            message: "Job hidden from your feed",
            duration: UNDO_TOAST_DURATION,
            action: { label: "Undo", run: () => setJobs((current) => [...current.slice(0, index), job, ...current.slice(index)]) },
          });
        },
        onBlock: (job) => toast.success(`Blocked ${job.title} (demo)`),
      }}
    /></div>
  </Stack>;
}
