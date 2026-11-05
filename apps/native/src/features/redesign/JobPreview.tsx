import { parseJobDescription } from "@pinkslip/core/job-description";
import { useJob, usePreferences, useResumeProfile, useSession } from "@pinkslip/data";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Text, Ticket } from "../../ui";
import type { RowJob } from "../jobs/useJobActions";
import { JobIdentity } from "./JobIdentity";
import { jobYears, ticketRows, ticketStub } from "./job-facts";
import { roleLines, yearsGap } from "./job-preview-facts";

/** Its height until it's measured: the header, the ticket and two lines. */
const ESTIMATE = 470;

/**
 * A job row's long-press preview (Paper "Job preview on long press · Nov 4",
 * B, approved): the job's header and ticket, then a line from what you'd do
 * and one from what it asks, with the years gap when the job asks for more
 * than the resume shows. None of the job page's buttons, which do nothing in
 * a preview; tapping it opens the job. It renders only while it shows, so
 * the job's description loads on the long press.
 */
export function useJobPreview(job: RowJob) {
  const [height, setHeight] = useState(ESTIMATE);
  return { style: { height }, content: <JobPreview job={job} onHeight={setHeight} /> };
}

function JobPreview({ job, onHeight }: { job: RowJob; onHeight: (height: number) => void }) {
  const detail = useJob(job.id).data ?? job;
  const signedIn = useSession().data?.state === "authenticated";
  const profile = usePreferences().data?.search_profile;
  const resume = useResumeProfile(signedIn).data?.data;
  const rows = useMemo(() => ticketRows(detail, profile), [detail, profile]);
  const lines = useMemo(() => {
    const asked = jobYears(detail);
    const blocks = parseJobDescription(detail.description, { title: detail.title, companyName: detail.company_name });
    return roleLines(blocks, yearsGap(asked, resume), asked);
  }, [detail, resume]);
  return <View style={styles.card} onLayout={(event) => onHeight(Math.ceil(event.nativeEvent.layout.height))}>
    <JobIdentity companyName={detail.company_name} companyDomain={detail.company_domain} title={detail.title} closed={Boolean(detail.closed_at)} />
    <Ticket rows={rows} stub={ticketStub(detail)} />
    {lines.does || lines.asks ? <View style={styles.role}>
      {lines.does ? <Text role="subhead">{lines.does}</Text> : null}
      {lines.asks ? <Text role="subhead" tone="ink-2">{lines.asks}</Text> : null}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  card: { gap: theme.ui.space["4"], padding: theme.ui.space["4"], backgroundColor: theme.ui.color.bg },
  role: { gap: 6, paddingHorizontal: theme.ui.space["1"] },
}));
