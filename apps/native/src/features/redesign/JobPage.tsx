import { parseJobDescription } from "@pinkslip/core/job-description";
import { usePreferences } from "@pinkslip/data";
import { router, Stack, useIsFocused } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Menu, Sheet } from "../../kit";
import { Button, Icon, IconButton, ListGroup, ListItem, SheetModal, Text, Ticket, useToastLift } from "../../ui";
import { ApplyPrep, DidYouApply } from "./ApplySheets";
import { useDetailJob, useJobPageActions, type DetailJob, type JobMenuItem } from "../job-detail/useJobPage";
import { Description } from "./Description";
import { JobIdentity } from "./JobIdentity";
import { appliedLabel, fitsYourSearch, orderedPlaces, plainText, ticketRows, ticketStub } from "./job-facts";

/** The job page, redesigned (Take A): logo, company and title, the facts as
 * a ticket, why it fits your search, the posting, and Save and Apply pinned
 * at the bottom. Applying tears the ticket's stub off. */
export function JobPage({ jobId, outreachThread }: { jobId: string; outreachThread?: string }) {
  const { theme } = useUnistyles();
  const { job, status, full, failed, pendingDescription, retryDescription, retry } = useDetailJob(jobId);
  if (!job) {
    return <View style={styles.center}>
      <Stack.Screen options={{ title: "" }} />
      {status === "loading" ? <ActivityIndicator color={theme.ui.color["ink-3"]} />
        : <View style={styles.missing}>
          <Text role="title2" align="center">{status === "gone" ? "This job isn't available" : "This job didn't load"}</Text>
          <Text role="subhead" tone="ink-2" align="center">{status === "gone" ? "It may have closed or been removed." : "Check your connection and try again."}</Text>
          {status === "error" ? <Button size="small" onPress={retry}>Try again</Button> : null}
        </View>}
    </View>;
  }
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
  const { saved, applied, closed, toggleSave, apply, share, menu, sheets, applyFlow } = useJobPageActions(job, { outreachThread, controlsColor: theme.ui.color.accent, ownSheets: true });
  const [placesOpen, setPlacesOpen] = useState(false);

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
        <Ticket rows={rows} stub={ticketStub(job)} torn={applied} />
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
    <TopBar onShare={share} menu={menu.filter((item) => item.label !== "Share")} />
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, theme.ui.space["4"]) }]}>
      {applied
        ? <Button icon="done" fullWidth>{appliedLabel(job)}</Button>
        : <>
          <Button icon={saved ? "saved" : "save"} accessibilityLabel={saved ? "Saved. Tap to remove" : "Save job"} onPress={toggleSave}>{saved ? "Saved" : "Save"}</Button>
          <View style={styles.primary}>
            <Button variant="primary" fullWidth disabled={closed || !job.url} onPress={apply}>{closed ? "Listing closed" : "Apply"}</Button>
          </View>
        </>}
    </View>
    {sheets}
    <SheetModal open={applyFlow.asking} onClosed={applyFlow.endAsking}><DidYouApply onYes={applyFlow.confirmApplied} /></SheetModal>
    <SheetModal open={applyFlow.preparing} onClosed={applyFlow.endPreparing}>
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

/** Back on the left; share and the ⋯ menu in one pill on the right (Paper
 * "Job page"), drawn with our icons. The menu is the system's, text only. */
export function TopBar({ onShare, menu }: { onShare: () => void; menu: JobMenuItem[] }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.top, { paddingTop: insets.top }]} pointerEvents="box-none">
    <IconButton icon="back" label="Back" onPress={() => router.back()} />
    <View style={styles.pill}>
      <Pressable onPress={onShare} accessibilityRole="button" accessibilityLabel="Share" style={styles.slot}><Icon name="share" size={20} /></Pressable>
      <Menu title="" items={menu.map((item, index) => ({ id: String(index), title: item.label, destructive: item.destructive, onSelect: item.run }))}>
        <View style={styles.slot} accessibilityRole="button" accessibilityLabel="More job actions"><Icon name="more" size={22} /></View>
      </Menu>
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
  missing: { alignItems: "center", gap: theme.ui.space["3"], paddingHorizontal: theme.ui.space["8"] },
  body: { paddingHorizontal: theme.ui.size.gutter, paddingTop: theme.ui.space["2"] },
  ticket: { marginTop: theme.ui.space["6"] },
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
    flexDirection: "row",
    gap: theme.ui.space["3"],
    paddingTop: theme.ui.space["3"],
    paddingHorizontal: theme.ui.size.gutter,
    backgroundColor: theme.ui.color.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.ui.color.separator,
  },
  primary: { flex: 1 },
}));
