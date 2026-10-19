import { parseJobDescription } from "@pinkslip/core/job-description";
import { applicationsQueryOptions, useApi, usePreferences } from "@pinkslip/data";
import { useQuery } from "@tanstack/react-query";
import { router, Stack, useIsFocused, useSegments } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Sheet } from "../../kit";
import {
  ApplyButton, Button, CompanyLogo, EmptyState, GlyphMenu, Icon, IconButton, ListGroup, ListItem, SheetModal, StampedSlip, Text, Ticket, useStubCatch, useToastLift,
  type GlyphMenuSpec,
} from "../../ui";
import { logoUri } from "../jobs/CompanyLogo";
import { ApplyPrep, DidYouApply } from "./ApplySheets";
import { useDetailJob, useJobPageActions, type DetailJob } from "../job-detail/useJobPage";
import { Description } from "./Description";
import { JobIdentity } from "./JobIdentity";
import { applyButtonState, fitsYourSearch, orderedPlaces, plainText, rowFacts, ticketRows, ticketStub } from "./job-facts";

/** The job page, redesigned (Take A): logo, company and title, the facts as
 * a ticket, why it fits your search, the posting, and Save and Apply pinned
 * at the bottom. Applying tears the ticket's stub off. */
export function JobPage({ jobId, outreachThread }: { jobId: string; outreachThread?: string }) {
  const { theme } = useUnistyles();
  const { job, status, full, failed, pendingDescription, retryDescription, retry } = useDetailJob(jobId);
  if (!job) {
    if (status === "loading") return <View style={styles.center}>
      <Stack.Screen options={{ title: "" }} />
      <ActivityIndicator color={theme.ui.color["ink-3"]} />
    </View>;
    // A link to a job that isn't there (W4) is rare enough for its slip; a
    // job that didn't load is plain, with a grey retry (Paper "Errors · Oct 15").
    return <ErrorPage>{status === "gone"
      ? <EmptyState art={<StampedSlip stamp="RETURN TO SENDER" detail="NO SUCH PAGE"><BrokenLink path={`pinkslip.alip.dev/jobs/${jobId.slice(0, 4)}…`} /></StampedSlip>}
        title="This link goes nowhere" message="It may be old, or cut short."
        action={{ label: "Go to Jobs", onPress: () => router.navigate("/") }} />
      : <EmptyState title="This job didn't load" message="Check your connection and try again."
        action={{ label: "Try again", variant: "secondary", onPress: retry }} />}</ErrorPage>;
  }
  if (job.closed_at) return <ClosedJob job={job} />;
  return <JobView job={job} full={full || failed} pendingDescription={pendingDescription} onRetryDescription={retryDescription} outreachThread={outreachThread} />;
}

function JobView({ job, full, pendingDescription, onRetryDescription, outreachThread }: {
  job: DetailJob;
  /** The full posting loaded, or failed to: either way, stop the spinner. */
  full: boolean;
  pendingDescription: boolean;
  onRetryDescription: () => void;
  outreachThread?: string;
}) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  usePinnedBarToastLift();
  const profile = usePreferences().data?.search_profile;
  const { saved, applied, closed, covered, toggleSave, apply, share, glyphMenu, sheets, applyFlow } = useJobPageActions(job, { outreachThread, controlsColor: theme.ui.color.accent, ownSheets: true });
  const [placesOpen, setPlacesOpen] = useState(false);
  // The stub tears once you can see it, and the button says Applied as it lands.
  const tear = useStubCatch(applied, covered);
  const applyState = applyButtonState(job, tear.applied, closed);
  // Past Applied, the button opens the application, so find it in Tracker's list.
  const applications = useQuery({ ...applicationsQueryOptions(useApi()), enabled: applyState.kind === "stage" });
  const applicationId = applications.data?.find((item) => item.job_id === job.id)?.id;
  const tab = (useSegments() as readonly string[])[1] ?? "(jobs)";
  const openApplication = applicationId
    ? () => router.push({ pathname: `/(tabs)/${tab}/applications/[applicationId]` as "/(tabs)/(library)/applications/[applicationId]", params: { applicationId } })
    : undefined;

  const blocks = useMemo(() => parseJobDescription(job.description, { title: job.title, companyName: job.company_name }),
    [job.description, job.title, job.company_name]);
  const places = useMemo(() => orderedPlaces(job, profile), [job, profile]);
  const rows = useMemo(() => ticketRows(job, profile).map((row) => row.map((fact) =>
    fact.detail ? { ...fact, onPress: () => setPlacesOpen(true) } : fact)), [job, profile]);
  const fits = fitsYourSearch(job, profile);

  // Tell VoiceOver when a pending posting arrives, or stops trying; the page shows it.
  const wasPending = useRef(pendingDescription);
  useEffect(() => {
    if (wasPending.current && !pendingDescription) AccessibilityInfo.announceForAccessibility(blocks.length > 0 ? "The full posting loaded." : "The full posting isn't available yet.");
    wasPending.current = pendingDescription;
  }, [pendingDescription, blocks.length]);

  return <View style={styles.fill}>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView style={styles.fill}
      contentContainerStyle={[styles.body, { paddingTop: insets.top + TOP_BAR + theme.ui.space["2"], paddingBottom: BAR + insets.bottom + theme.ui.space["6"] }]}>
      <JobIdentity companyName={job.company_name} companyDomain={job.company_domain} companyId={job.company_id} title={job.title} closed={closed} />
      <View style={styles.ticket}>
        <Ticket rows={rows} stub={ticketStub(job)} torn={tear.torn} catcher={tear.bar} onCaught={tear.onCaught} />
      </View>
      <Animated.View layout={LinearTransition.duration(240)} style={styles.after}>
        {fits.length > 0 ? <View style={styles.fits}>
          <Icon name="matches" size={18} tone="ink-3" />
          <Text role="subhead" tone="ink-2" flex>Fits your search: {fits.join(", ")}</Text>
        </View> : null}
        <View style={styles.about}>
          <Text weight="medium" accessibilityRole="header">About the role</Text>
          {!full || pendingDescription ? <ActivityIndicator style={styles.spinner} color={theme.ui.color["ink-3"]} />
            : blocks.length > 0 ? <Description blocks={blocks} />
            : <View style={styles.noPosting}>
              <Text role="subhead" tone="ink-2">The full posting didn't come through. The original may still have it.</Text>
              <Button size="small" icon="refresh" onPress={onRetryDescription}>Try again</Button>
            </View>}
        </View>
      </Animated.View>
    </ScrollView>
    <TopBar onShare={share} menu={glyphMenu} />
    <View ref={tear.bar} style={[styles.bar, { paddingBottom: Math.max(insets.bottom, theme.ui.space["4"]) }]}>
      <Animated.View style={tear.dip}>
        <ApplyButton state={applyState} saved={saved} onSave={toggleSave}
          onPress={applyState.kind === "apply" ? (job.url ? apply : undefined) : applyState.kind === "stage" ? openApplication : undefined} />
      </Animated.View>
    </View>
    {sheets}
    <SheetModal open={applyFlow.asking} onClosed={applyFlow.endAsking}><DidYouApply onYes={applyFlow.confirmApplied} /></SheetModal>
    <SheetModal open={applyFlow.preparing} onClosed={applyFlow.endPreparing} onGone={applyFlow.prepGone}>
      <ApplyPrep job={job} onOpen={applyFlow.openAssisted} onAlreadyApplied={applyFlow.confirmApplied} />
    </SheetModal>
    <Sheet open={placesOpen} onOpenChange={setPlacesOpen} title="Locations">
      <ListGroup>
        {places.map((entry) => <ListItem key={entry.place} title={entry.place} value={entry.matched ? "Your search" : undefined} />)}
      </ListGroup>
    </Sheet>
  </View>;
}

/** The pinned bar's height above the home indicator: a 50pt button and 12 above it. */
export const BAR = 50 + 12;
export const TOP_BAR = 44;

/** While the page shows, toasts sit 12 above its pinned bar. */
export function usePinnedBarToastLift() {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  useToastLift(useIsFocused() ? Math.max(insets.bottom, theme.ui.space["4"]) + BAR : null);
}

/** A page with nothing to show: the round Back, then the error centred in
 * the room (W3, W4; the event page's E2c too). */
export function ErrorPage({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={styles.fill}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={[styles.errorTop, { paddingTop: insets.top }]}><IconButton icon="back" label="Back" onPress={() => router.back()} /></View>
    <View style={styles.errorBody}>{children}</View>
  </View>;
}

/** W3: the job's own ticket, stamped CLOSED with the day it closed, and the
 * way on to the company's other jobs. */
function ClosedJob({ job }: { job: DetailJob }) {
  const tab = (useSegments() as readonly string[])[1] ?? "(jobs)";
  const company = plainText(job.company_name);
  const day = new Date(job.closed_at!).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase();
  const companyId = job.company_id;
  return <ErrorPage>
    <EmptyState art={<StampedSlip stamp="CLOSED" detail={day}>
      <View style={styles.slipJob}>
        <CompanyLogo name={job.company_name} uri={logoUri(job.company_domain)} />
        <View style={styles.slipText}>
          <Text role="subhead" tone="ink-2" lines={1}>{company}</Text>
          <Text weight="medium" lines={2}>{plainText(job.title)}</Text>
        </View>
      </View>
      <View style={styles.slipRule} />
      <Text role="footnote" tone="ink-2" lines={1}>{rowFacts(job)}</Text>
    </StampedSlip>}
      title="This job closed" message={`${company} stopped taking applications.`}
      action={companyId
        ? { label: `More jobs at ${company}`, onPress: () => router.push({ pathname: `/(tabs)/${tab}/companies/[companyId]` as "/(tabs)/(jobs)/companies/[companyId]", params: { companyId } }) }
        : { label: "Go to Jobs", onPress: () => router.navigate("/") }} />
  </ErrorPage>;
}

/** W4's slip: a blank posting with the link at its foot. */
/** The broken link's slip: two grey lines, the rule, and where the link pointed. */
export function BrokenLink({ path }: { path: string }) {
  return <>
    <View style={styles.slipLines}>
      <View style={[styles.slipLine, styles.slipLineTitle]} />
      <View style={[styles.slipLine, styles.slipLineLong]} />
    </View>
    <View style={styles.slipRule} />
    <Text role="footnote" tone="ink-3" lines={1}>{path}</Text>
  </>;
}

/** Back on the left; share and the ⋯ menu in one pill on the right (Paper
 * "Job page"), drawn with our icons. The menu is the system's, with our
 * icons too (Paper "Menus · Oct 16" M2). */
export function TopBar({ onShare, menu }: { onShare: () => void; menu: GlyphMenuSpec }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.top, { paddingTop: insets.top }]} pointerEvents="box-none">
    <IconButton icon="back" label="Back" onPress={() => router.back()} />
    <View style={styles.pill}>
      <Pressable onPress={onShare} accessibilityRole="button" accessibilityLabel="Share" style={styles.slot}><Icon name="share" size={20} /></Pressable>
      <GlyphMenu {...menu}>
        <View style={styles.slot} accessibilityRole="button" accessibilityLabel="More job actions"><Icon name="more" size={22} /></View>
      </GlyphMenu>
    </View>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.ui.color.bg },
  top: {
    position: "absolute", top: 0, left: 0, right: 0,
    flexDirection: "row", justifyContent: "space-between", paddingHorizontal: theme.ui.size.gutter,
  },
  pill: { flexDirection: "row", borderRadius: theme.ui.radius.full, backgroundColor: theme.ui.color.fill },
  slot: { width: theme.ui.size.iconButton, height: theme.ui.size.iconButton, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color.bg },
  errorTop: { paddingHorizontal: theme.ui.size.gutter },
  // Centred in the room under Back, a little above the middle.
  errorBody: { flex: 1, justifyContent: "center", paddingBottom: 64 },
  slipJob: { flexDirection: "row", alignItems: "flex-start", gap: theme.ui.space["3"] },
  slipText: { flex: 1, gap: 2 },
  slipRule: { height: 1, marginVertical: theme.ui.space["3"], borderTopWidth: 1, borderStyle: "dashed", borderColor: theme.ui.color["ink-4"] },
  slipLines: { gap: 10, paddingVertical: 6 },
  slipLine: { borderRadius: 4 },
  slipLineTitle: { width: 96, height: 8, backgroundColor: theme.ui.color["ink-4"] },
  slipLineLong: { width: 160, height: 7, backgroundColor: theme.ui.color.separator },
  body: { paddingHorizontal: theme.ui.size.gutter, paddingTop: theme.ui.space["2"] },
  // Above what follows, so the torn stub falls over the page.
  ticket: { marginTop: theme.ui.space["6"], zIndex: 1 },
  after: { gap: theme.ui.space["6"], marginTop: theme.ui.space["6"] },
  fits: { flexDirection: "row", alignItems: "flex-start", gap: theme.ui.space["2"] },
  about: { gap: theme.ui.space["2"] },
  spinner: { alignSelf: "flex-start", paddingVertical: theme.ui.space["4"] },
  noPosting: { gap: theme.ui.space["3"], alignItems: "flex-start" },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: theme.ui.space["3"],
    paddingHorizontal: theme.ui.size.gutter,
    backgroundColor: theme.ui.color.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.ui.color.separator,
  },
}));
