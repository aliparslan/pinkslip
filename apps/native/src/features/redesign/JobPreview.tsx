import { useJob, usePreferences } from "@pinkslip/data";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Ticket } from "../../ui";
import type { RowJob } from "../jobs/useJobActions";
import { JobIdentity } from "./JobIdentity";
import { plainText, ticketRows, ticketStub } from "./job-facts";

/** The preview of a job with a one-line title and one place, measured. It's
 * laid out as wide as the screen, and iOS scales it down to fit. */
const ONE_LINE = 343;
/** A title line (`title2`), and the other places' line under Location. */
const TITLE_LINE = 28;
const PLACES_LINE = 20;
/** What the title doesn't get of the screen: the padding, logo and gap. */
const BESIDE_TITLE = 92;
/** A wide `title2` character: too many lines beats a clipped ticket. */
const TITLE_CHARACTER = 11.2;

function titleLines(title: string): number {
  const fits = Math.floor((Dimensions.get("window").width - BESIDE_TITLE) / TITLE_CHARACTER);
  let lines = 1;
  let used = 0;
  for (const word of title.split(/\s+/)) {
    if (used > 0 && used + 1 + word.length > fits) {
      lines += 1;
      used = 0;
    }
    used += (used > 0 ? 1 : 0) + word.length;
    while (used > fits) {
      lines += 1;
      used -= fits;
    }
  }
  return lines;
}

/** iOS reads the height once, as the preview opens, and the content can only
 * be measured after that. So a first open goes by this (owner, 2026-11-08: a
 * guess too tall left the menu far below and the card's end square). */
function expectedHeight(job: RowJob): number {
  const places = (job.location ?? "").split(/[;|]| \/ /).filter((place) => place.trim()).length;
  return ONE_LINE + (titleLines(plainText(job.title)) - 1) * TITLE_LINE + (places > 1 ? PLACES_LINE : 0);
}

/**
 * A job row's long-press preview (Paper "Job preview on long press · Nov 4",
 * A; owner, 2026-11-04: B's lines under the ticket went): the job's header
 * and ticket. None of the job page's buttons, which do nothing in a preview;
 * tapping it opens the job. It renders only while it shows. An unread job
 * you've looked at this way is read once the preview closes, as Mail's are
 * (owner, 2026-11-07); its menu still offers Mark as read while it's up.
 */
export function useJobPreview(job: RowJob, onSeen?: () => void) {
  // Keyed by job: the list reuses a row, and its state, for other jobs.
  const [measured, setMeasured] = useState<{ id: string; height: number } | null>(null);
  const height = measured?.id === job.id ? measured.height : expectedHeight(job);
  return { style: { height }, content: <JobPreview job={job} onHeight={(next) => setMeasured({ id: job.id, height: next })} onSeen={onSeen} /> };
}

function JobPreview({ job, onHeight, onSeen }: { job: RowJob; onHeight: (height: number) => void; onSeen?: () => void }) {
  const seen = useRef(onSeen);
  seen.current = onSeen;
  // Told only once it closes: iOS reads the height just after the first
  // layout, which is narrower and too tall.
  const laidOut = useRef(0);
  const report = useRef(onHeight);
  report.current = onHeight;
  useEffect(() => () => {
    seen.current?.();
    if (laidOut.current > 0) report.current(laidOut.current);
  }, []);
  const detail = useJob(job.id).data ?? job;
  const profile = usePreferences().data?.search_profile;
  const rows = useMemo(() => ticketRows(detail, profile), [detail, profile]);
  // The fill keeps the preview's rounded end whatever the guess was.
  return <View style={styles.fill}>
    <View style={styles.card} onLayout={(event) => { laidOut.current = Math.ceil(event.nativeEvent.layout.height); }}>
      <JobIdentity companyName={detail.company_name} companyDomain={detail.company_domain} title={detail.title} closed={Boolean(detail.closed_at)} />
      <Ticket rows={rows} stub={ticketStub(detail)} />
    </View>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.ui.color.bg },
  card: { gap: theme.ui.space["4"], padding: theme.ui.space["4"] },
}));
