import { readableCode, REVIEW_REASONS } from "@pinkslip/core/admin-format";
import type { ContentReport, FeedbackSubmission, JobReview } from "@pinkslip/core/api";
import {
  useFeedbackInbox, useJobReviews, useModerateFeedback, useModerateReport, useModerateReview, useRefreshInbox, useReports,
} from "@pinkslip/data";
import { useState } from "react";
import { Pressable } from "react-native";
import { Badge, Button, Inline, Screen, Spinner, Stack, Text, Textarea, usePullToRefresh } from "../../kit";
import { toast, UNDO_TOAST_DURATION } from "../../ui";
import { Actions, Centered, Entries, Entry, Failure, LinkOut, SectionHead } from "./parts";

const failed = () => toast.error("Couldn't update that. Try again.");

/** The web admin's Inbox: feedback, listing reports, and jobs the classifier
 * flagged for review. Every decision leaves the list at once and offers Undo. */
export function Inbox() {
  const feedback = useFeedbackInbox();
  const reports = useReports();
  const reviews = useJobReviews();
  const pull = usePullToRefresh(() => Promise.all([feedback.refetch(), reports.refetch(), reviews.refetch()]));
  if (feedback.isPending && reports.isPending && reviews.isPending) return <Centered><Spinner label="Loading inbox" /></Centered>;
  return <Screen refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
    <FeedbackSection query={feedback} />
    <ReportsSection query={reports} />
    <ReviewsSection query={reviews} />
  </Screen>;
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
  return <Stack gap="2">
    <SectionHead title="Feedback" count={query.data ? `${query.data.length} active` : undefined} />
    {query.isError ? <Failure title="Feedback didn't load" onRetry={() => void query.refetch()} retrying={query.isFetching} />
      : query.data && <Entries empty="No active feedback.">{query.data.map((item) => <Entry key={item.id}>
        <Stack gap="1">
          <Text weight="medium">{item.title}</Text>
          <Text size="sm" tone="ink-3">{item.user_name || "User"} · {new Date(item.created_at).toLocaleDateString()}</Text>
        </Stack>
        <Inline gap="1" wrap>
          <Badge>{readableCode(item.submission_type)}</Badge>
          {item.status === "planned" && <Badge>Planned</Badge>}
        </Inline>
        {item.details ? <Text size="sm" tone="ink-2">{item.details}</Text> : null}
        {item.careers_url ? <LinkOut label="Careers page" href={item.careers_url} /> : null}
        <Actions>
          <Button size="compact" onPress={() => decide(item, "declined")}>Decline</Button>
          {item.status !== "planned" && <Button size="compact" onPress={() => decide(item, "planned")}>Plan</Button>}
          <Button size="compact" variant="primary" onPress={() => decide(item, "resolved")}>Resolve</Button>
        </Actions>
      </Entry>)}</Entries>}
  </Stack>;
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
  return <Stack gap="2">
    <SectionHead title="Listing reports" count={query.data ? `${query.data.length} open` : undefined} />
    {query.isError ? <Failure title="Reports didn't load" onRetry={() => void query.refetch()} retrying={query.isFetching} />
      : query.data && <Entries empty="No open reports.">{query.data.map((report) => <Entry key={report.id}>
        <Stack gap="1">
          <Text weight="medium">{report.job_title ?? report.company_name ?? "Unknown listing"}</Text>
          {report.job_title && report.company_name ? <Text size="sm" tone="ink-3">{report.company_name}</Text> : null}
        </Stack>
        <Inline gap="1"><Badge>{readableCode(report.report_type)}</Badge></Inline>
        {report.notes ? <Text size="sm" tone="ink-2">{report.notes}</Text> : null}
        <Actions>
          <Button size="compact" onPress={() => decide(report, "dismissed")}>Dismiss</Button>
          <Button size="compact" variant="primary" onPress={() => decide(report, "resolved")}>Resolve</Button>
        </Actions>
      </Entry>)}</Entries>}
  </Stack>;
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
  return <Stack gap="2">
    <SectionHead title="Needs review" count={query.data ? `${total} open` : undefined} />
    {query.isError && !query.data ? <Failure title="Reviews didn't load" onRetry={() => void query.refetch()} retrying={query.isFetching} />
      : query.data && <Stack gap="3">
        <Entries empty="Nothing needs review.">{reviews.map((review) => <Entry key={review.job_id}>
          <Stack gap="1">
            <Text weight="medium">{review.title}</Text>
            <Text size="sm" tone="ink-3">{review.company_name} · {review.location}</Text>
          </Stack>
          <Stack gap="1" accessibilityLabel="Flagged because">
            {review.reason_codes.map((reason) => <Text key={reason} size="sm" tone="ink-2">• {REVIEW_REASONS[reason] ?? readableCode(reason)}</Text>)}
          </Stack>
          <Inline gap="4">
            <LinkOut label="Source" href={review.url} />
            <Pressable accessibilityRole="button" hitSlop={8} accessibilityState={{ expanded: noteOpen[review.job_id] === true }}
              onPress={() => setNoteOpen({ ...noteOpen, [review.job_id]: !noteOpen[review.job_id] })}>
              <Text size="sm" tone="accent">{noteOpen[review.job_id] ? "Hide note" : "Add note"}</Text>
            </Pressable>
          </Inline>
          {noteOpen[review.job_id] && <Textarea accessibilityLabel="Review note" placeholder="Optional note" multiline
            value={notes[review.job_id] ?? ""} onChangeText={(text) => setNotes({ ...notes, [review.job_id]: text })} />}
          <Actions>
            <Button size="compact" onPress={() => decide(review, "rejected")}>Reject</Button>
            <Button size="compact" variant="primary" onPress={() => decide(review, "approved")}>Approve</Button>
          </Actions>
        </Entry>)}</Entries>
        {query.hasNextPage && <Button fullWidth pending={query.isFetchingNextPage} onPress={() => void query.fetchNextPage()}>
          {`Load more (${reviews.length} of ${total})`}
        </Button>}
      </Stack>}
  </Stack>;
}
