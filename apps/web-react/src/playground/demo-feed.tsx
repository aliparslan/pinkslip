import type { Job } from "@pinkslip/core/api";
import { isFreshJobTiming } from "@pinkslip/core/job-timing";
import { useToastManager } from "@pinkslip/ui/toast";
import { useRef, useState } from "react";
import { CompanyMark } from "../components/company-mark";
import { JobListItem } from "../components/job-list";
import { JobRow, JobRowSkeleton } from "../components/job-row";

/* A working feed for demos: opening marks a job viewed, Save toggles, and
   hiding, hiding a company, or marking applied takes rows out with Undo.
   This is demo state only; the real feed gets it from the shared core. */

export const initiallyViewed = ["datadog-be-grad", "cloudflare-sec-ec", "databricks-de"];

export function useDemoFeed(initialJobs: Job[]) {
  const toasts = useToastManager();
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [viewed, setViewed] = useState<Set<string>>(() => new Set(initiallyViewed));
  const [selected, setSelected] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());
  const leavingRef = useRef(leaving);
  leavingRef.current = leaving;

  function remove(ids: string[], title: string, description: string, company: string) {
    setLeaving((current) => new Set([...current, ...ids]));
    toasts.add({
      title,
      description,
      data: { leading: <CompanyMark name={company} size="sm" /> },
      actionProps: {
        children: "Undo",
        onClick: () => setLeaving((current) => new Set([...current].filter((id) => !ids.includes(id)))),
      },
      // Once Undo is no longer offered, the rows leave the list for good.
      onRemove: () => {
        const gone = ids.filter((id) => leavingRef.current.has(id));
        if (gone.length) setJobs((current) => current.filter((job) => !gone.includes(job.id)));
      },
    });
  }

  function setViewedFor(id: string, on: boolean) {
    setViewed((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function rowProps(job: Job, options: { admin?: boolean } = {}) {
    return {
      job,
      href: `#job-${job.id}`,
      viewed: viewed.has(job.id),
      selected: selected === job.id,
      onOpen: (event: { preventDefault: () => void }) => {
        event.preventDefault();
        setViewedFor(job.id, true);
        setSelected(job.id);
      },
      onSavedChange: (saved: boolean) =>
        setJobs((current) => current.map((other) => (other.id === job.id ? { ...other, saved } : other))),
      onMarkUnread: viewed.has(job.id) ? () => setViewedFor(job.id, false) : undefined,
      onMarkApplied: () => remove([job.id], "Marked as applied", "Moved to Applied in your Library.", job.company_name),
      onHide: () => remove([job.id], "Job hidden from your feed", job.title, job.company_name),
      onHideCompany: () =>
        remove(
          jobs.filter((other) => other.company_name === job.company_name).map((other) => other.id),
          `${job.company_name} hidden`,
          "Their jobs won't show up again. You can bring them back from Companies.",
          job.company_name,
        ),
      onReport: () =>
        toasts.add({ title: "Report listing", description: "Opens the report sheet, which comes with the sheets." }),
      onBlock: options.admin ? () => remove([job.id], "Removed for everyone", job.title, job.company_name) : undefined,
    };
  }

  const isNew = (job: Job) => !viewed.has(job.id) && !job.closed_at && isFreshJobTiming(job);

  function reset() {
    setJobs(initialJobs);
    setViewed(new Set(initiallyViewed));
    setSelected(null);
    setLeaving(new Set());
  }

  return { jobs, leaving, rowProps, isNew, reset };
}

export type DemoFeed = ReturnType<typeof useDemoFeed>;

/** The rows of a demo feed, ready to sit inside a JobList or any list. */
export function DemoFeedRows({
  feed,
  jobs = feed.jobs,
  loading = false,
  admin = false,
}: {
  feed: DemoFeed;
  jobs?: Job[];
  loading?: boolean;
  admin?: boolean;
}) {
  if (loading) {
    return Array.from({ length: 5 }, (_, index) => (
      <JobListItem key={index}>
        <JobRowSkeleton />
      </JobListItem>
    ));
  }
  return jobs.map((job) => (
    <JobListItem key={job.id} leaving={feed.leaving.has(job.id)}>
      <JobRow {...feed.rowProps(job, { admin })} />
    </JobListItem>
  ));
}
