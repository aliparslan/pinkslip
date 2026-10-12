import { parseJobDescription } from "@pinkslip/core/job-description";
import { formatJobLocation, normalizeSalaryText } from "@pinkslip/core/job-format";
import { jobOriginalTimingLabel, jobTimingLabel } from "@pinkslip/core/job-timing";
import { Stack } from "expo-router";
import { ArrowCounterClockwise, ArrowSquareOut, BookmarkSimple, CheckCircle, ClockCounterClockwise, MapPin, Money, WarningCircle } from "phosphor-react-native";
import { useEffect, useMemo, useRef } from "react";
import { ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Badge, Button, EmptyState, Heading, Skeleton, Spinner, Text, toast } from "../../kit";
import { CompanyLogo } from "../jobs/CompanyLogo";
import { Description } from "./Description";
import { useDetailJob, useJobPageActions, type DetailJob } from "./useJobPage";

/**
 * `JobDetail.svelte` for iOS: company, title, location, pay and dates, the
 * posting drawn from core's blocks. Apply and Save sit under the title (a
 * bottom bar would sit under the floating tab bar); everything else is in the
 * navigation bar's menu, as the web's single action bar groups it. Apply opens the posting
 * in Safari inside the app; closing it asks whether you applied.
 */
export function JobDetail({ jobId, outreachThread }: { jobId: string; outreachThread?: string }) {
  const { job, status, full, pendingDescription, retryDescription, retry } = useDetailJob(jobId);
  if (!job) {
    if (status === "loading") return <View style={styles.center}><Spinner label="Loading job" /></View>;
    if (status === "gone") {
      return <View style={styles.center}><EmptyState icon={WarningCircle} title="This job isn't available" message="It may have closed or been removed." /></View>;
    }
    return <View style={styles.center}><EmptyState icon={WarningCircle} title="This job didn't load" message="Check your connection and try again."
      actions={<Button onPress={retry}>Try again</Button>} /></View>;
  }
  return <JobView job={job} full={full} pendingDescription={pendingDescription} onRetryDescription={retryDescription} outreachThread={outreachThread} />;
}

function JobView({ job, full, pendingDescription, onRetryDescription, outreachThread }: {
  job: DetailJob;
  full: boolean;
  pendingDescription: boolean;
  onRetryDescription: () => void;
  outreachThread?: string;
}) {
  const { theme } = useUnistyles();
  const { saved, applied, closed, toggleSave, apply, menu, sheets } = useJobPageActions(job, { outreachThread, controlsColor: theme.colors.accent });
  const blocks = useMemo(() => parseJobDescription(job.description, { title: job.title, companyName: job.company_name }),
    [job.description, job.title, job.company_name]);
  const salary = normalizeSalaryText(job.salary?.trim() ? job.salary : null);
  const location = formatJobLocation(job.location);
  const original = jobOriginalTimingLabel(job);
  // Announce when a pending posting arrives, or stops trying.
  const wasPending = useRef(pendingDescription);
  useEffect(() => {
    if (wasPending.current && !pendingDescription) toast.show({ message: blocks.length > 0 ? "The full posting loaded." : "The full posting isn't available yet.", dedupeKey: "posting" });
    wasPending.current = pendingDescription;
  }, [pendingDescription, blocks.length]);

  return <View style={styles.fill}>
    <Stack.Screen options={{
      title: "",
      unstable_headerRightItems: () => [{
        type: "menu",
        label: "More job actions",
        icon: { type: "sfSymbol", name: "ellipsis" },
        menu: {
          items: menu.map((item) => ({ type: "action" as const, label: item.label, icon: { type: "sfSymbol" as const, name: item.icon as never }, destructive: item.destructive, onPress: item.run })),
        },
      }],
    }} />
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.body}>
      <View style={styles.identity}>
        <CompanyLogo name={job.company_name} domain={job.company_domain} size={44} />
        <View style={styles.heading}>
          <View style={styles.companyLine}>
            <Text size="sm" weight="medium" tone="ink-2" truncate>{job.company_name} · {jobTimingLabel(job)}</Text>
            {closed && <Badge>Closed</Badge>}
          </View>
          <Heading variant="display-md">{job.title}</Heading>
        </View>
      </View>
      <View style={styles.meta}>
        {location && <Fact icon={MapPin} text={location} />}
        {salary && <Fact icon={Money} text={salary} />}
        {original && <Fact icon={ClockCounterClockwise} text={original} />}
      </View>
      <View style={styles.actionBlock}>
        <View style={styles.actions}>
          <Button icon={BookmarkSimple} iconFill={saved} accessibilityLabel={saved ? "Remove from saved jobs" : "Save job"} onPress={toggleSave}>{saved ? "Saved" : "Save"}</Button>
          <View style={styles.primary}>
            {applied ? <Button icon={CheckCircle} fullWidth disabled>Applied</Button>
              : <Button variant="primary" icon={ArrowSquareOut} fullWidth disabled={closed || !job.url}
                onPress={apply}>{closed ? "Listing closed" : "Apply"}</Button>}
          </View>
        </View>
        {(closed || !job.url) && !applied && <Text size="sm" tone="ink-3">{closed ? "This listing is closed." : "Application link unavailable."}</Text>}
      </View>
      <View style={styles.about}>
        <Heading>About the role</Heading>
        {!full ? <View style={styles.skeleton}><Skeleton width="92%" /><Skeleton width="86%" /><Skeleton width="64%" /></View>
          : pendingDescription ? <Text tone="ink-2">Pulling the full posting now. This usually lands in a second or two.</Text>
          : blocks.length > 0 ? <Description blocks={blocks} />
          : <View style={styles.missing}>
            <Text tone="ink-2">We couldn't pull the full job description yet. The original posting may still have it.</Text>
            <Button size="compact" icon={ArrowCounterClockwise} onPress={onRetryDescription}>Try again</Button>
          </View>}
      </View>
    </ScrollView>
    {sheets}
  </View>;
}

function Fact({ icon: Glyph, text }: { icon: typeof MapPin; text: string }) {
  const { theme } = useUnistyles();
  return <View style={styles.fact}><Glyph size={15} color={theme.colors["ink-3"]} /><Text size="sm" tone="ink-2">{text}</Text></View>;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.colors.bg },
  center: { flex: 1, justifyContent: "center", backgroundColor: theme.colors.bg },
  body: { padding: theme.gutter, gap: theme.space["5"], paddingBottom: theme.space["10"] },
  identity: { flexDirection: "row", gap: theme.space["3"], alignItems: "flex-start" },
  heading: { flex: 1, gap: theme.space["1"] },
  companyLine: { flexDirection: "row", alignItems: "center", gap: theme.space["2"] },
  meta: { gap: theme.space["2"] },
  fact: { flexDirection: "row", alignItems: "center", gap: theme.space["2"] },
  about: { gap: theme.space["3"] },
  skeleton: { gap: theme.space["2"] },
  missing: { gap: theme.space["3"], alignItems: "flex-start" },
  actionBlock: { gap: theme.space["2"] },
  actions: { flexDirection: "row", gap: theme.space["3"] },
  primary: { flex: 1 },
}));
