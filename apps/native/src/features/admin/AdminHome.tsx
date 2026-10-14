import { sourceNeedsAttention } from "@pinkslip/core/admin-format";
import { timeAgo } from "@pinkslip/core/utils";
import {
  useClassificationReport, useCompanies, useFeedbackInbox, useJobReviews, useProductMetrics, useRecruiterReview, useReports, useRuns,
} from "@pinkslip/data";
import { router, type Href } from "expo-router";
import { ArrowsClockwise, Buildings, ChartBar, IdentificationBadge, Scales, Tray } from "phosphor-react-native";
import { ListRow, ListSection, Screen, usePullToRefresh } from "../../kit";

/** The admin workspace's front page: one row per tool, each with where it
 * stands, so the work that's waiting is visible before opening anything. */
export function AdminHome() {
  const metrics = useProductMetrics();
  const feedback = useFeedbackInbox();
  const reports = useReports();
  const reviews = useJobReviews();
  const runs = useRuns();
  const companies = useCompanies();
  const jev = useClassificationReport();
  const recruiters = useRecruiterReview();
  const pull = usePullToRefresh(() => Promise.all([
    metrics.refetch(), feedback.refetch(), reports.refetch(), reviews.refetch(), runs.refetch(), companies.refetch(), jev.refetch(),
    recruiters.refetch(),
  ]));

  const open = feedback.data && reports.data && reviews.data
    ? feedback.data.length + reports.data.length + (reviews.data.pages.at(-1)?.meta.total ?? 0)
    : undefined;
  const latest = runs.data?.[0];
  const sources = companies.data;
  const attention = sources?.filter(sourceNeedsAttention).length ?? 0;
  const toReview = jev.data?.available ? (jev.data.disagreements ?? []).filter((row) => !row.review).length : undefined;
  const toLabel = recruiters.data?.available
    ? (recruiters.data.candidates ?? []).filter((row) => row.left_out_reason === null && (row.works_there === null || row.actual_role === null)).length
    : undefined;
  const go = (href: Href) => () => router.push(href);

  return <Screen refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
    <ListSection>
      <ListRow title="Inbox" icon={Tray} onPress={go("/you/admin/inbox")}
        detail={open === undefined ? undefined : open === 0 ? "Clear" : `${open} open`} />
      <ListRow title="Product health" icon={ChartBar} onPress={go("/you/admin/health")}
        detail={metrics.data ? `Last ${metrics.data.period_days} days` : undefined} />
    </ListSection>
    <ListSection label="Pipeline">
      <ListRow title="Runs" icon={ArrowsClockwise} onPress={go("/you/admin/runs")}
        detail={latest ? `${latest.status === "error" ? "Errors" : latest.status === "running" ? "Running" : "Completed"} · ${timeAgo(latest.started_at)}` : undefined} />
      <ListRow title="Sources" icon={Buildings} onPress={go("/you/admin/sources")}
        detail={sources ? `${sources.filter((company) => company.enabled).length} active${attention ? ` · ${attention} need attention` : ""}` : undefined} />
      <ListRow title="Jev" icon={Scales} onPress={go("/you/admin/jev")}
        detail={toReview === undefined ? undefined : toReview === 0 ? "Nothing to review" : `${toReview} to review`} />
    </ListSection>
    <ListSection label="Outreach">
      <ListRow title="Recruiters" icon={IdentificationBadge} onPress={go("/you/admin/recruiters")}
        detail={toLabel === undefined ? undefined : toLabel === 0 ? "Nothing to label" : `${toLabel} to label`} />
    </ListSection>
  </Screen>;
}
