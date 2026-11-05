import { useJob, usePreferences } from "@pinkslip/data";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Ticket } from "../../ui";
import type { RowJob } from "../jobs/useJobActions";
import { JobIdentity } from "./JobIdentity";
import { ticketRows, ticketStub } from "./job-facts";

/** Its height until it's measured: the header and the ticket. */
const ESTIMATE = 370;

/**
 * A job row's long-press preview (Paper "Job preview on long press · Nov 4",
 * A; owner, 2026-11-04: B's lines under the ticket went): the job's header
 * and ticket. None of the job page's buttons, which do nothing in a preview;
 * tapping it opens the job. It renders only while it shows.
 */
export function useJobPreview(job: RowJob) {
  const [height, setHeight] = useState(ESTIMATE);
  return { style: { height }, content: <JobPreview job={job} onHeight={setHeight} /> };
}

function JobPreview({ job, onHeight }: { job: RowJob; onHeight: (height: number) => void }) {
  const detail = useJob(job.id).data ?? job;
  const profile = usePreferences().data?.search_profile;
  const rows = useMemo(() => ticketRows(detail, profile), [detail, profile]);
  return <View style={styles.card} onLayout={(event) => onHeight(Math.ceil(event.nativeEvent.layout.height))}>
    <JobIdentity companyName={detail.company_name} companyDomain={detail.company_domain} title={detail.title} closed={Boolean(detail.closed_at)} />
    <Ticket rows={rows} stub={ticketStub(detail)} />
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  card: { gap: theme.ui.space["4"], padding: theme.ui.space["4"], backgroundColor: theme.ui.color.bg },
}));
