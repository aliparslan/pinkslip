import { useState, type ReactNode } from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";
import type { ContentReport, FeedbackSubmission, JobReview } from "@pinkslip/core/api";
import {
  useFeedbackInbox, useJobReviews, useModerateFeedback, useModerateReport, useModerateReview, useRefreshInbox, useReports,
} from "@pinkslip/data";
import { Badge, Button, Heading, Separator, Stack, Surface, Text, Textarea, toast, UNDO_TOAST_DURATION } from "../../kit";
import { InlineFailure, PageLoading } from "../states/LoadStates";
import styles from "./Admin.module.css";

const REVIEW_REASONS: Record<string, string> = {
  ambiguous_title_level: "Title level is ambiguous",
  experience_requirement_unparsed: "Experience requirement is unclear",
  advanced_degree_uncertain: "Doctorate may be required",
};

const readable = (value: string) => value.replaceAll("_", " ");
const failed = () => toast.error("Couldn't update that. Try again.");

function Section({ title, count, children }: { title: string; count?: string; children: ReactNode }) {
  return <Stack as="section" gap="2">
    <div className={styles.sectionHead}>
      <Heading level={2} variant="section">{title}</Heading>
      {count && <Text size="sm" tone="ink-3">{count}</Text>}
    </div>
    {children}
  </Stack>;
}

function Entries<T>({ items, keyOf, empty, render }: { items: T[]; keyOf: (item: T) => string; empty: string; render: (item: T) => ReactNode }) {
  if (items.length === 0) return <Surface variant="list"><div className={styles.empty}>{empty}</div></Surface>;
  return <Surface variant="list" bleedOnPhone as="ul">
    {items.map((item, index) => <li key={keyOf(item)} className={styles.item}>
      {index > 0 && <Separator />}
      <div className={styles.entry}>{render(item)}</div>
    </li>)}
  </Surface>;
}

/** `InboxSection.svelte`: feedback, listing reports, and jobs the classifier
 * flagged for review. Every decision leaves the list at once and offers Undo. */
export function Inbox() {
  const feedback = useFeedbackInbox();
  const reports = useReports();
  const reviews = useJobReviews();
  if (feedback.isPending && reports.isPending && reviews.isPending) return <PageLoading label="Loading inbox" />;
  return <Stack gap="6">
    <Heading level={1} variant="screen">Inbox</Heading>
    <FeedbackSection query={feedback} />
    <ReportsSection query={reports} />
    <ReviewsSection query={reviews} />
  </Stack>;
}

function FeedbackSection({ query }: { query: ReturnType<typeof useFeedbackInbox> }) {
  const moderate = useModerateFeedback();
  const refresh = useRefreshInbox();
  const decide = (item: FeedbackSubmission, status: "planned" | "resolved" | "declined") => moderate.mutate({ id: item.id, status }, {
    onSuccess: () => toast.show({
      message: status === "planned" ? "Feedback planned" : status === "resolved" ? "Feedback resolved" : "Feedback declined",
      dedupeKey: `feedback-${item.id}`, duration: UNDO_TOAST_DURATION,
      action: { label: "Undo", run: () => moderate.mutate({ id: item.id, status: item.status }, { onSettled: () => void refresh("feedback"), onError: failed }) },
    }),
    onError: failed,
  });
  return <Section title="Feedback" count={query.data ? `${query.data.length} active` : undefined}>
    {query.isError ? <InlineFailure title="Feedback didn't load" onRetry={() => void query.refetch()} retrying={query.isFetching} />
      : query.data && <Entries items={query.data} keyOf={(item) => item.id} empty="No active feedback." render={(item) => <>
        <div className={styles.entryHead}>
          <span className={styles.entryCopy}>
            <Text weight="medium">{item.title}</Text>
            <Text size="sm" tone="ink-3">{item.user_name || "User"} · {new Date(item.created_at).toLocaleDateString()}</Text>
          </span>
          <span className={styles.tags}>
            <Badge>{readable(item.submission_type)}</Badge>
            {item.status === "planned" && <Badge>Planned</Badge>}
          </span>
        </div>
        {item.details && <div className={styles.detail}>{item.details}</div>}
        {item.careers_url && <a className={styles.link} href={item.careers_url} target="_blank" rel="noopener noreferrer">
          <ArrowSquareOut size={15} aria-hidden /> Careers page
        </a>}
        <div className={styles.actions}>
          <Button size="compact" onClick={() => decide(item, "declined")}>Decline</Button>
          {item.status !== "planned" && <Button size="compact" onClick={() => decide(item, "planned")}>Plan</Button>}
          <Button size="compact" variant="primary" onClick={() => decide(item, "resolved")}>Resolve</Button>
        </div>
      </>} />}
  </Section>;
}

function ReportsSection({ query }: { query: ReturnType<typeof useReports> }) {
  const moderate = useModerateReport();
  const refresh = useRefreshInbox();
  const decide = (report: ContentReport, status: "resolved" | "dismissed") => moderate.mutate({ id: report.id, status }, {
    onSuccess: () => toast.show({
      message: status === "resolved" ? "Report resolved" : "Report dismissed",
      dedupeKey: `report-${report.id}`, duration: UNDO_TOAST_DURATION,
      action: { label: "Undo", run: () => moderate.mutate({ id: report.id, status: "open" }, { onSettled: () => void refresh("reports"), onError: failed }) },
    }),
    onError: failed,
  });
  return <Section title="Listing reports" count={query.data ? `${query.data.length} open` : undefined}>
    {query.isError ? <InlineFailure title="Reports didn't load" onRetry={() => void query.refetch()} retrying={query.isFetching} />
      : query.data && <Entries items={query.data} keyOf={(report) => report.id} empty="No open reports." render={(report) => <>
        <div className={styles.entryHead}>
          <span className={styles.entryCopy}>
            <Text weight="medium">{report.job_title ?? report.company_name ?? "Unknown listing"}</Text>
            {report.job_title && report.company_name && <Text size="sm" tone="ink-3">{report.company_name}</Text>}
          </span>
          <span className={styles.tags}><Badge>{readable(report.report_type)}</Badge></span>
        </div>
        {report.notes && <div className={styles.detail}>{report.notes}</div>}
        <div className={styles.actions}>
          <Button size="compact" onClick={() => decide(report, "dismissed")}>Dismiss</Button>
          <Button size="compact" variant="primary" onClick={() => decide(report, "resolved")}>Resolve</Button>
        </div>
      </>} />}
  </Section>;
}

function ReviewsSection({ query }: { query: ReturnType<typeof useJobReviews> }) {
  const moderate = useModerateReview();
  const refresh = useRefreshInbox();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});
  const reviews = query.data?.pages.flatMap((page) => page.reviews) ?? [];
  const total = query.data?.pages.at(-1)?.meta.total ?? 0;
  const decide = (review: JobReview, state: "approved" | "rejected") => {
    const note = notes[review.job_id]?.trim() || undefined;
    moderate.mutate({ jobId: review.job_id, state, note }, {
      onSuccess: () => toast.show({
        message: state === "approved" ? "Job approved" : "Job rejected",
        dedupeKey: `review-${review.job_id}`, duration: UNDO_TOAST_DURATION,
        action: { label: "Undo", run: () => moderate.mutate({ jobId: review.job_id, state: "needs_review", note }, { onSettled: () => void refresh("reviews"), onError: failed }) },
      }),
      onError: failed,
    });
  };
  return <Section title="Needs review" count={query.data ? `${total} open` : undefined}>
    {query.isError && !query.data ? <InlineFailure title="Reviews didn't load" onRetry={() => void query.refetch()} retrying={query.isFetching} />
      : query.data && <Stack gap="3">
        <Entries items={reviews} keyOf={(review) => review.job_id} empty="Nothing needs review." render={(review) => <>
          <span className={styles.entryCopy}>
            <Text weight="medium">{review.title}</Text>
            <Text size="sm" tone="ink-3">{review.company_name} · {review.location}</Text>
          </span>
          <ul className={styles.reasons} aria-label="Flagged because">
            {review.reason_codes.map((reason) => <li key={reason}>{REVIEW_REASONS[reason] ?? readable(reason)}</li>)}
          </ul>
          <div className={styles.links}>
            <a className={styles.link} href={review.url} target="_blank" rel="noopener noreferrer">
              <ArrowSquareOut size={15} aria-hidden /> Source
            </a>
            <button type="button" className={styles.textButton} aria-expanded={noteOpen[review.job_id] === true}
              onClick={() => setNoteOpen({ ...noteOpen, [review.job_id]: !noteOpen[review.job_id] })}>
              {noteOpen[review.job_id] ? "Hide note" : "Add note"}
            </button>
          </div>
          {noteOpen[review.job_id] && <Textarea aria-label="Review note" rows={2} placeholder="Optional note"
            value={notes[review.job_id] ?? ""} onChange={(event) => setNotes({ ...notes, [review.job_id]: event.target.value })} />}
          <div className={styles.actions}>
            <Button size="compact" onClick={() => decide(review, "rejected")}>Reject</Button>
            <Button size="compact" variant="primary" onClick={() => decide(review, "approved")}>Approve</Button>
          </div>
        </>} />
        {query.hasNextPage && <Button fullWidth pending={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          Load more ({reviews.length} of {total})
        </Button>}
      </Stack>}
  </Section>;
}
