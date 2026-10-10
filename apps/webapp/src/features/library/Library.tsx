import { Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { BookmarkSimple, CheckCircle } from "@phosphor-icons/react";
import { timeAgo } from "@pinkslip/core/utils";
import { useAppliedJobs, useSavedJobs } from "@pinkslip/data";
import { EmptyState, Heading, Tabs } from "../../kit";
import { JobList } from "../jobs/JobList";
import { useJobActions } from "../jobs/useJobActions";
import { PageFailure, PageLoading } from "../states/LoadStates";
import { LinkButton } from "../navigation/LinkButton";
import styles from "./Library.module.css";

export type LibraryView = "saved" | "applied";

export interface LibraryProps {
  view: LibraryView;
  selectedId?: string;
  onOrderChange?: (ids: string[]) => void;
}

/** `JobLibrary.svelte`: a "Library" title over Saved/Applied tabs (links, so
 * each tab is its own URL) with their counts, and the jobs in each. Removing
 * a job from either list is optimistic and offers Undo. */
export function Library({ view, selectedId, onOrderChange }: LibraryProps) {
  const saved = useSavedJobs();
  const applied = useAppliedJobs();
  const active = view === "saved" ? saved : applied;
  const { actions, dialog, onOpen } = useJobActions(view);
  // Each list implies its flag, whatever the row payload carries.
  const jobs = useMemo(() => (active.data ?? []).map((job) => (view === "saved" ? { ...job, saved: true } : { ...job, applied: true })),
    [active.data, view]);

  useEffect(() => { onOrderChange?.(jobs.map((job) => job.id)); }, [jobs, onOrderChange]);

  return <section className={styles.root} aria-labelledby="library-title">
    <Heading level={1} variant="root" id="library-title">Library</Heading>
    <Tabs<LibraryView> label="Your jobs" value={view} tabs={[
      { value: "saved", label: "Saved", icon: BookmarkSimple, count: saved.data?.length, render: <Link to="/library/saved" resetScroll /> },
      { value: "applied", label: "Applied", icon: CheckCircle, count: applied.data?.length, render: <Link to="/library/applied" resetScroll /> },
    ]} />
    {active.isPending ? <PageLoading label="Loading your jobs" />
      : active.isError && !active.data ? <PageFailure title="Your library didn't load" onRetry={() => void active.refetch()} retrying={active.isFetching} />
      : jobs.length === 0 ? (view === "saved"
        ? <EmptyState icon={BookmarkSimple} title="No saved jobs"
          message="Save promising roles from their job page and they'll stay here."
          actions={<LinkButton to="/" variant="secondary">Browse jobs</LinkButton>} />
        : <EmptyState icon={CheckCircle} title="No applications yet"
          message="Jobs you mark as applied will become your application history." />)
      : <div className={styles.list}>
        <JobList jobs={jobs} label={view === "saved" ? "Saved jobs" : "Applied jobs"} selectedId={selectedId}
          from={view === "saved" ? "library-saved" : "library-applied"} onOpen={onOpen} actions={actions}
          contextLabel={view === "applied" ? (job) => (job.applied_at ? `Applied ${timeAgo(job.applied_at)}` : "Applied") : undefined} />
      </div>}
    {dialog}
  </section>;
}
