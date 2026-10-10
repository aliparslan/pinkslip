import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { forwardRef, useEffect, useMemo, useState } from "react";
import {
  ArrowCounterClockwise, ArrowSquareOut, BookmarkSimple, CheckCircle, ClockCounterClockwise,
  DotsThree, EyeSlash, Flag, MapPin, Money, Prohibit, ShareNetwork, Sparkle, ThumbsDown, type IconProps,
} from "@phosphor-icons/react";
import type { Job } from "@pinkslip/core/api";
import { parseJobDescription } from "@pinkslip/core/job-description";
import { formatJobLocation, normalizeSalaryText } from "@pinkslip/core/job-format";
import { jobOriginalTimingLabel, jobTimingLabel } from "@pinkslip/core/job-timing";
import {
  useBlockJob, useHideCompany, useHideJob, useJob, useMarkApplied, useMarkViewed, usePublicJob, useSaveJob,
  useUnmarkApplied, useUnsaveJob,
} from "@pinkslip/data";
import {
  AlertDialog, Badge, Button, Heading, Menu, MenuItem, MenuSeparator, Skeleton, Text, toast,
  UNDO_TOAST_DURATION,
} from "../../kit";
import { CompanyLogo } from "../jobs/CompanyLogo";
import { cachedJob, type AnyJob } from "../jobs/cached-job";
import { usePromoteVisitor, useSessionAccess } from "../jobs/useJobActions";
import type { JobOrigin } from "../jobs/JobRow";
import { rememberedFeedSearch } from "../feed/criteria";
import { jobRoot } from "../navigation/back-target";
import { useNeighbours } from "../split/neighbours";
import { PageFailure, PageLoading } from "../states/LoadStates";
import { JobNotFoundPage } from "../states/PageStates";
import { openApplication } from "./application-return";
import { useTrack } from "../jobs/track";
import { Description } from "./Description";
import { ReportDialog } from "./ReportDialog";
import styles from "./JobDetail.module.css";

type DetailJob = AnyJob & Partial<Job>;

/** The Save button's icon once saved: the same bookmark, filled. */
const SavedBookmark = forwardRef<SVGSVGElement, IconProps>((props, ref) => <BookmarkSimple ref={ref} {...props} weight="fill" />);
SavedBookmark.displayName = "SavedBookmark";

async function share(job: DetailJob) {
  const url = `${window.location.origin}/jobs/${encodeURIComponent(job.id)}`;
  const data = { title: `${job.title} · ${job.company_name}`, text: `${job.title} at ${job.company_name}`, url };
  if (navigator.share && navigator.canShare?.(data) !== false) {
    await navigator.share(data).catch(() => undefined);
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    toast.success("Link copied");
  } catch {
    toast.error("Couldn't copy the link.");
  }
}

/**
 * `JobDetail.svelte` for the web, with its actions in one place (D17): the
 * company and title, location, salary and dates, the posting,
 * and one action bar (Apply, Save, and a menu with everything else) pinned
 * to the bottom. Anyone can read it: the server renders the public listing,
 * and a session adds saved/applied state and the match reason.
 */
export function JobDetail() {
  const { jobId } = useParams({ strict: false }) as { jobId: string };
  const search = useSearch({ strict: false });
  const from = ("from" in search ? search.from : undefined) as JobOrigin | undefined;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const access = useSessionAccess();
  const promote = usePromoteVisitor();

  const publicJob = usePublicJob(jobId);
  const personal = useJob(jobId, access.personal);
  const seed = useMemo(() => cachedJob(queryClient, jobId), [queryClient, jobId]);
  const job: DetailJob | undefined = personal.data ?? publicJob.data ?? seed;

  const markViewed = useMarkViewed();
  const track = useTrack();
  useEffect(() => {
    if (!access.personal) return;
    markViewed(jobId);
    track("job_opened", { type: "job", id: jobId });
  }, [access.personal, jobId, markViewed, track]);

  if (!job) {
    // Not in the public catalog: a signed-in person's own copy may still
    // exist. The server and visitors get the 404 view straight away.
    if (access.personal && personal.isPending) return <PageLoading label="Loading job" />;
    if (publicJob.data === null) return <JobNotFoundPage />;
    if (publicJob.isError) {
      return <PageFailure level={1} title="This job didn't load" onRetry={() => void publicJob.refetch()} retrying={publicJob.isFetching} />;
    }
    return <PageLoading label="Loading job" />;
  }
  return <JobView job={job} from={from} full={Boolean(personal.data ?? publicJob.data)}
    pendingDescription={Boolean(personal.data?.content_pending && !personal.data.description && personal.isFetching)}
    onRetryDescription={() => void (access.personal ? personal.refetch() : publicJob.refetch())}
    leave={() => {
      const root = jobRoot(search);
      void navigate(root === "/" ? { to: "/", search: rememberedFeedSearch(), replace: true } : { to: root, replace: true });
    }}
    navigateTo={(id) => void navigate({ to: "/jobs/$jobId", params: { jobId: id }, search: from ? { from } : {}, resetScroll: false })}
    access={access} promote={promote} />;
}

interface JobViewProps {
  job: DetailJob;
  from?: JobOrigin;
  /** False while only a list row's summary is known. */
  full: boolean;
  pendingDescription: boolean;
  onRetryDescription: () => void;
  leave: () => void;
  navigateTo: (id: string) => void;
  access: ReturnType<typeof useSessionAccess>;
  promote: () => void;
}

function JobView({ job, from, full, pendingDescription, onRetryDescription, leave, navigateTo, access, promote }: JobViewProps) {
  const navigate = useNavigate();
  const save = useSaveJob();
  const unsave = useUnsaveJob();
  const markApplied = useMarkApplied();
  const unmarkApplied = useUnmarkApplied();
  const hideJob = useHideJob();
  const hideCompany = useHideCompany();
  const block = useBlockJob();
  const [reporting, setReporting] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const { previous, next } = useNeighbours(job.id);
  const track = useTrack();

  // j/k step through the list beside the job, as in mail and feed readers
  // (keyboard only; the owner dropped the on-screen arrows).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable], [role=menu], [role=dialog]")) return;
      const id = event.key === "j" ? next : event.key === "k" ? previous : undefined;
      if (!id) return;
      event.preventDefault();
      navigateTo(id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, previous, navigateTo]);

  const salary = normalizeSalaryText(job.salary?.trim() ? job.salary : null);
  const location = formatJobLocation(job.location);
  const original = jobOriginalTimingLabel(job);
  const blocks = useMemo(() => parseJobDescription(job.description, { title: job.title, companyName: job.company_name }),
    [job.description, job.title, job.company_name]);
  const saved = Boolean(job.saved);
  const applied = Boolean(job.applied);
  const closed = Boolean(job.closed_at);
  const asJob = job as Job;

  const toggleSave = () => (saved ? unsave : save).mutate(job.id, {
    onSuccess: () => { if (!saved) promote(); },
    onError: () => toast.error("Couldn't update your saved jobs. Try again."),
  });
  const setApplied = (value: boolean) => (value ? markApplied : unmarkApplied).mutate(asJob, {
    onSuccess: () => {
      promote();
      toast.success(value ? "Added to applied jobs" : "Removed from applied jobs");
    },
    onError: () => toast.error("Couldn't update this job. Try again."),
  });
  const notInterested = () => {
    hideJob(job.id).then((hidden) => {
      promote();
      leave();
      toast.show({ message: "Job hidden", duration: UNDO_TOAST_DURATION, action: { label: "Undo", run: () => hidden.undo().catch(() => { toast.error("Couldn't bring that job back."); }) } });
    }, () => toast.error("Couldn't hide this job. Try again."));
  };
  const hideTheCompany = () => {
    if (!job.company_id) return;
    hideCompany(job.company_id).then((hidden) => {
      leave();
      toast.show({ message: `${job.company_name} hidden`, duration: UNDO_TOAST_DURATION, action: { label: "Undo", run: () => hidden.undo().catch(() => { toast.error("Couldn't bring that company back."); }) } });
    }, () => toast.error("Couldn't hide this company. Try again."));
  };

  return <article className={styles.root} aria-labelledby="job-title">
    <header className={styles.identity}>
      <CompanyLogo name={job.company_name} domain={job.company_domain} size={44} />
      <div className={styles.heading}>
        <div className={styles.companyLine}>
          <Text as="span" size="sm" weight="medium" tone="ink-2" truncate>
            {job.company_name} · <span suppressHydrationWarning>{jobTimingLabel(job)}</span>
          </Text>
          {closed && <Badge>Closed</Badge>}
        </div>
        <Heading level={1} variant="display-md" id="job-title">{job.title}</Heading>
      </div>
    </header>

    <ul className={styles.meta}>
      {location && <li><MapPin size={15} aria-hidden /><span>{location}</span></li>}
      {salary && <li><Money size={15} aria-hidden /><span>{salary}</span></li>}
      {original && <li><ClockCounterClockwise size={15} aria-hidden /><span suppressHydrationWarning>{original}</span></li>}
    </ul>

    <section className={styles.about} aria-labelledby="about-role" aria-busy={pendingDescription || !full || undefined}>
      <Heading level={2} variant="section" id="about-role">About the role</Heading>
      {!full ? <div className={styles.descriptionSkeleton}>
        <Skeleton width="92%" /><Skeleton width="86%" /><Skeleton width="64%" />
      </div>
        : pendingDescription ? <Text tone="ink-2">Pulling the full posting now. This usually lands in a second or two.</Text>
        : blocks.length > 0 ? <Description blocks={blocks} />
        : <div className={styles.missing}>
          <Text tone="ink-2">We couldn’t pull the full job description yet. The original posting may still have it.</Text>
          <Button variant="secondary" size="compact" icon={ArrowCounterClockwise} onClick={onRetryDescription}>Try again</Button>
        </div>}
      {full && job.url && <a className={styles.original} href={job.url} target="_blank" rel="noopener noreferrer">
        Read the original posting <ArrowSquareOut size={13} aria-hidden />
      </a>}
    </section>

    <div className={styles.actionBar}>
      {(closed || !job.url) && !applied && <p className={styles.actionStatus} id="application-status">
        {closed ? "This listing is closed." : "Application link unavailable."}
        {access.personal && <button type="button" className={styles.textButton} onClick={() => setReporting(true)}>Report listing</button>}
      </p>}
      <div className={styles.actions}>
        {applied
          ? <Button variant="secondary" icon={CheckCircle} disabled>Applied</Button>
          : <Button variant="primary" icon={ArrowSquareOut} disabled={closed || !job.url}
            aria-describedby={closed || !job.url ? "application-status" : undefined}
            onClick={() => {
              if (access.personal) track("apply_clicked", { type: "job", id: job.id });
              // Only a session can record an application, so visitors aren't asked.
              openApplication({ id: job.id, title: job.title, company_name: job.company_name, url: job.url }, access.personal);
            }}>
            {closed ? "Listing closed" : job.url ? "Apply" : "Link unavailable"}
          </Button>}
        {access.canRead && <Button variant="secondary" icon={saved ? SavedBookmark : BookmarkSimple} aria-pressed={saved} onClick={toggleSave}
          aria-label={saved ? "Remove from saved jobs" : "Save job"}>
          {saved ? "Saved" : "Save"}
        </Button>}
        <Menu label="More job actions" trigger={{ icon: DotsThree, label: "More job actions" }}>
          {access.personal && (applied
            ? <MenuItem icon={ArrowCounterClockwise} onSelect={() => setApplied(false)}>I didn't apply</MenuItem>
            : <MenuItem icon={CheckCircle} onSelect={() => setApplied(true)}>I applied</MenuItem>)}
          {access.personal && !applied && <MenuItem icon={ThumbsDown} onSelect={notInterested}>Not interested</MenuItem>}
          {access.personal && <MenuItem icon={Sparkle} onSelect={() => void navigate({ to: "/tailor/$jobId", params: { jobId: job.id }, search: from ? { from } : {} })}>Tailor resume</MenuItem>}
          <MenuItem icon={ShareNetwork} onSelect={() => void share(job)}>Share</MenuItem>
          {access.personal && job.company_id && <MenuItem icon={EyeSlash} onSelect={hideTheCompany}>Hide {job.company_name}</MenuItem>}
          {access.personal && <MenuItem icon={Flag} onSelect={() => setReporting(true)}>Report listing</MenuItem>}
          {access.admin && <>
            <MenuSeparator />
            <MenuItem icon={Prohibit} tone="danger" onSelect={() => setConfirmBlock(true)}>Block for everyone</MenuItem>
          </>}
        </Menu>
      </div>
    </div>

    <ReportDialog jobId={job.id} open={reporting} onOpenChange={setReporting} onSent={promote} />
    <AlertDialog open={confirmBlock} onOpenChange={setConfirmBlock} title="Block this job?"
      description={`This permanently removes ${job.title} at ${job.company_name} for everyone.`}
      confirmLabel="Block job" tone="danger" pending={block.isPending}
      onConfirm={() => block.mutate(job.id, {
        onSuccess: () => { setConfirmBlock(false); leave(); toast.success("Job blocked for everyone"); },
        onError: () => toast.error("Couldn't block this job. Try again."),
      })} />
  </article>;
}
