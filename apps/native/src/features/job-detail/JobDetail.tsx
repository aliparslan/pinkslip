import type { Job } from "@pinkslip/core/api";
import { parseJobDescription } from "@pinkslip/core/job-description";
import { formatJobLocation, normalizeSalaryText } from "@pinkslip/core/job-format";
import { jobOriginalTimingLabel, jobTimingLabel } from "@pinkslip/core/job-timing";
import {
  useApi, useBlockJob, useHideCompany, useHideJob, useJob, useMarkApplied, useMarkViewed, usePublicJob, useSaveJob, useSession,
  useUnmarkApplied, useUnsaveJob,
} from "@pinkslip/data";
import { useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { router, Stack, usePathname } from "expo-router";
import { ArrowCounterClockwise, ArrowSquareOut, BookmarkSimple, CheckCircle, ClockCounterClockwise, MapPin, Money, WarningCircle } from "phosphor-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Badge, Button, EmptyState, Heading, Skeleton, Spinner, Text, toast, UNDO_TOAST_DURATION } from "../../kit";
import { haptics } from "../../platform/haptics";
import { shareJob } from "../../platform/share";
import { ApplicationBrowser, type ApplicationRequest } from "../apply/ApplicationBrowser";
import { OutreachSheet } from "../apply/OutreachSheet";
import { CompanyLogo } from "../jobs/CompanyLogo";
import { cachedJob, type AnyJob } from "../jobs/cached-job";
import { useTrack } from "../jobs/track";
import { Description } from "./Description";
import { ReportSheet } from "./ReportSheet";

type DetailJob = AnyJob & Partial<Job>;

/** Which tab the job is open in, so related screens push onto the same stack. */
function useTabGroup(): "(jobs)" | "(library)" {
  return usePathname().startsWith("/library") ? "(library)" : "(jobs)";
}

/**
 * `JobDetail.svelte` for iOS: company, title, location, pay and dates, the
 * posting drawn from core's blocks. Apply and Save sit under the title (a
 * bottom bar would sit under the floating tab bar); everything else is in the
 * navigation bar's menu, as the web's single action bar groups it. Apply opens the posting
 * in Safari inside the app; closing it asks whether you applied.
 */
export function JobDetail({ jobId, outreachThread }: { jobId: string; outreachThread?: string }) {
  const queryClient = useQueryClient();
  const publicJob = usePublicJob(jobId);
  const personal = useJob(jobId);
  const seed = useMemo(() => cachedJob(queryClient, jobId), [queryClient, jobId]);
  const job: DetailJob | undefined = personal.data ?? publicJob.data ?? seed;
  const markViewed = useMarkViewed();
  const track = useTrack();

  useEffect(() => {
    markViewed(jobId);
    track("job_opened", { type: "job", id: jobId });
  }, [jobId, markViewed, track]);

  if (!job) {
    if (personal.isPending || publicJob.isPending) return <View style={styles.center}><Spinner label="Loading job" /></View>;
    if (personal.isError && publicJob.data === null) {
      return <View style={styles.center}><EmptyState icon={WarningCircle} title="This job isn't available" message="It may have closed or been removed." /></View>;
    }
    return <View style={styles.center}><EmptyState icon={WarningCircle} title="This job didn't load" message="Check your connection and try again."
      actions={<Button onPress={() => { void personal.refetch(); void publicJob.refetch(); }}>Try again</Button>} /></View>;
  }
  return <JobView job={job} full={Boolean(personal.data ?? publicJob.data)}
    pendingDescription={Boolean(personal.data?.content_pending && !personal.data.description && personal.isFetching)}
    onRetryDescription={() => void personal.refetch()} outreachThread={outreachThread} />;
}

function JobView({ job, full, pendingDescription, onRetryDescription, outreachThread }: {
  job: DetailJob;
  full: boolean;
  pendingDescription: boolean;
  onRetryDescription: () => void;
  outreachThread?: string;
}) {
  const { theme } = useUnistyles();
  const group = useTabGroup();
  const session = useSession().data;
  const features = session?.me?.features;
  const admin = Boolean(session?.me?.is_admin);
  const autoApply = Boolean(features?.auto_apply_enabled);
  const autoSubmit = Boolean(features?.auto_submit_enabled);
  const outreach = Boolean(features?.outreach_enabled);
  const save = useSaveJob();
  const unsave = useUnsaveJob();
  const markApplied = useMarkApplied();
  const unmarkApplied = useUnmarkApplied();
  const hideJob = useHideJob();
  const hideCompany = useHideCompany();
  const block = useBlockJob();
  const track = useTrack();
  const api = useApi();
  const [applying, setApplying] = useState<ApplicationRequest | null>(null);
  const [reporting, setReporting] = useState(false);
  const [emailing, setEmailing] = useState(Boolean(outreachThread && outreach));
  useEffect(() => { if (outreachThread && outreach) setEmailing(true); }, [outreachThread, outreach]);

  const blocks = useMemo(() => parseJobDescription(job.description, { title: job.title, companyName: job.company_name }),
    [job.description, job.title, job.company_name]);
  const salary = normalizeSalaryText(job.salary?.trim() ? job.salary : null);
  const location = formatJobLocation(job.location);
  const original = jobOriginalTimingLabel(job);
  const saved = Boolean(job.saved);
  const applied = Boolean(job.applied);
  const closed = Boolean(job.closed_at);
  const asJob = job as Job;

  // Announce when a pending posting arrives, or stops trying.
  const wasPending = useRef(pendingDescription);
  useEffect(() => {
    if (wasPending.current && !pendingDescription) toast.show({ message: blocks.length > 0 ? "The full posting loaded." : "The full posting isn't available yet.", dedupeKey: "posting" });
    wasPending.current = pendingDescription;
  }, [pendingDescription, blocks.length]);

  const setApplied = (value: boolean) => (value ? markApplied : unmarkApplied).mutate(asJob, {
    onSuccess: () => { if (value) haptics.success(); toast.success(value ? "Added to applied jobs" : "Removed from applied jobs"); },
    onError: () => toast.error("Couldn't update this job. Try again."),
  });
  const toggleSave = () => {
    haptics.tap();
    (saved ? unsave : save).mutate(job.id, { onError: () => toast.error("Couldn't update your saved jobs. Try again.") });
  };

  /** Safari opens over the app; closing it asks whether you applied, since
   * opening a posting alone never marks it applied. */
  const openApplication = async (url: string | null) => {
    const target = url ?? job.url;
    if (!target) return;
    track("apply_clicked", { type: "job", id: job.id, properties: autoApply ? { source: "prep" } : {} });
    await WebBrowser.openBrowserAsync(target, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET, controlsColor: theme.colors.accent });
    if (applied) return;
    Alert.alert("Did you apply?", `${job.title} at ${job.company_name}`, [
      { text: "Not yet", style: "cancel" },
      { text: "Yes, I applied", onPress: () => setApplied(true) },
    ]);
  };

  /** With auto-apply, the form opens in the application browser, which reads,
   * fills and (when allowed) submits it; a confirmed submission marks the job
   * applied. */
  const startAutoApply = async () => {
    track("apply_clicked", { type: "job", id: job.id, properties: { source: "auto_apply" } });
    const prepared = await api.apply.prepare(job.id).catch(() => null);
    const url = prepared?.apply_url ?? job.url;
    if (url) setApplying({ jobId: job.id, url, autoSubmit });
  };

  const leave = () => { if (router.canGoBack()) router.back(); };
  const notInterested = () => hideJob(job.id).then((hidden) => {
    leave();
    toast.show({ message: "Job hidden", duration: UNDO_TOAST_DURATION, action: { label: "Undo", run: () => hidden.undo().catch(() => { toast.error("Couldn't bring that job back."); }) } });
  }, () => toast.error("Couldn't hide this job. Try again."));
  const hideTheCompany = () => {
    if (!job.company_id) return;
    hideCompany(job.company_id).then((hidden) => {
      leave();
      toast.show({ message: `${job.company_name} hidden`, duration: UNDO_TOAST_DURATION, action: { label: "Undo", run: () => hidden.undo().catch(() => { toast.error("Couldn't bring that company back."); }) } });
    }, () => toast.error("Couldn't hide this company. Try again."));
  };
  const confirmBlock = () => Alert.alert("Block this job?", `This permanently removes ${job.title} at ${job.company_name} for everyone.`, [
    { text: "Cancel", style: "cancel" },
    { text: "Block job", style: "destructive", onPress: () => block.mutate(job.id, {
      onSuccess: () => { leave(); toast.success("Job blocked for everyone"); },
      onError: () => toast.error("Couldn't block this job. Try again."),
    }) },
  ]);

  const menu = [
    applied ? { label: "I didn't apply", icon: "arrow.uturn.backward", run: () => setApplied(false) } : { label: "I applied", icon: "checkmark.circle", run: () => setApplied(true) },
    !applied && { label: "Not interested", icon: "hand.thumbsdown", run: notInterested },
    outreach && { label: "Email recruiter", icon: "envelope", run: () => setEmailing(true) },
    { label: "Tailor resume", icon: "sparkles", run: () => router.push({ pathname: `/(tabs)/${group}/tailor/[jobId]`, params: { jobId: job.id } }) },
    { label: "Share", icon: "square.and.arrow.up", run: () => void shareJob(job) },
    job.company_id && { label: `Hide ${job.company_name}`, icon: "eye.slash", run: hideTheCompany },
    { label: "Report listing", icon: "flag", run: () => setReporting(true) },
    admin && { label: "Block for everyone", icon: "nosign", destructive: true, run: confirmBlock },
  ].filter((item): item is { label: string; icon: string; run: () => void; destructive?: boolean } => Boolean(item));

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
          <View style={styles.primary}>
            {applied ? <Button icon={CheckCircle} fullWidth disabled>Applied</Button>
              : <Button variant="primary" icon={ArrowSquareOut} fullWidth disabled={closed || !job.url}
                onPress={() => (autoApply ? void startAutoApply() : void openApplication(null))}>{closed ? "Listing closed" : "Apply"}</Button>}
          </View>
          <Button icon={BookmarkSimple} iconFill={saved} accessibilityLabel={saved ? "Remove from saved jobs" : "Save job"} onPress={toggleSave}>{saved ? "Saved" : "Save"}</Button>
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
    {autoApply && <ApplicationBrowser request={applying} onClose={() => setApplying(null)}
      onSubmitted={() => markApplied.mutate(asJob, { onSuccess: () => { haptics.success(); toast.success("Added to applied jobs"); } })} />}
    <ReportSheet jobId={job.id} open={reporting} onOpenChange={setReporting} />
    {outreach && <OutreachSheet jobId={job.id} companyName={job.company_name} threadId={outreachThread ?? null} open={emailing} onOpenChange={setEmailing} />}
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
