import { parseJobDescription } from "@pinkslip/core/job-description";
import { usePreferences } from "@pinkslip/data";
import { Stack } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import Animated, { LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Sheet, toast } from "../../kit";
import { Button, CompanyLogo, Icon, ListGroup, ListItem, Text, Ticket } from "../../ui";
import { useDetailJob, useJobPageActions, type DetailJob } from "../job-detail/useJobPage";
import { logoUri } from "../jobs/CompanyLogo";
import { Description } from "./Description";
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
  const profile = usePreferences().data?.search_profile;
  const { saved, applied, closed, toggleSave, apply, share, menu, sheets } = useJobPageActions(job, { outreachThread, controlsColor: theme.ui.color.accent });
  const [placesOpen, setPlacesOpen] = useState(false);

  const blocks = useMemo(() => parseJobDescription(job.description, { title: job.title, companyName: job.company_name }),
    [job.description, job.title, job.company_name]);
  const places = useMemo(() => orderedPlaces(job, profile), [job, profile]);
  const rows = useMemo(() => ticketRows(job, profile).map((row) => row.map((fact) =>
    fact.detail ? { ...fact, onPress: () => setPlacesOpen(true) } : fact)), [job, profile]);
  const fits = fitsYourSearch(job, profile);

  // Announce when a pending posting arrives, or stops trying.
  const wasPending = useRef(pendingDescription);
  useEffect(() => {
    if (wasPending.current && !pendingDescription) toast.show({ message: blocks.length > 0 ? "The full posting loaded." : "The full posting isn't available yet.", dedupeKey: "posting" });
    wasPending.current = pendingDescription;
  }, [pendingDescription, blocks.length]);

  return <View style={styles.fill}>
    <Stack.Screen options={{
      title: "",
      headerTintColor: theme.ui.color.ink,
      unstable_headerRightItems: () => [
        { type: "button", label: "Share", icon: { type: "sfSymbol", name: "square.and.arrow.up" }, onPress: share },
        {
          type: "menu",
          label: "More job actions",
          icon: { type: "sfSymbol", name: "ellipsis" },
          menu: {
            items: menu.filter((item) => item.label !== "Share").map((item) => ({
              type: "action" as const, label: item.label, icon: { type: "sfSymbol" as const, name: item.icon as never }, destructive: item.destructive, onPress: item.run,
            })),
          },
        },
      ],
    }} />
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={styles.fill}
      contentContainerStyle={[styles.body, { paddingBottom: BAR + insets.bottom + theme.ui.space["6"] }]}>
      <View style={styles.identity}>
        <CompanyLogo name={job.company_name} uri={logoUri(job.company_domain)} size="page" />
        <View style={styles.heading}>
          <Text role="subhead" tone="ink-2">{plainText(job.company_name)}{closed ? " · Closed" : ""}</Text>
          <Text role="title2" accessibilityRole="header">{plainText(job.title)}</Text>
        </View>
      </View>
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
    <Sheet open={placesOpen} onOpenChange={setPlacesOpen} title="Locations">
      <ListGroup>
        {places.map((entry) => <ListItem key={entry.place} title={entry.place} value={entry.matched ? "Your search" : undefined} />)}
      </ListGroup>
    </Sheet>
  </View>;
}

/** The pinned bar's height above the home indicator: a 50pt button and 12 above it. */
const BAR = 50 + 12;

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.ui.color.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color.bg },
  missing: { alignItems: "center", gap: theme.ui.space["3"], paddingHorizontal: theme.ui.space["8"] },
  body: { paddingHorizontal: theme.ui.size.gutter, paddingTop: theme.ui.space["2"] },
  identity: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  heading: { flex: 1, gap: 2 },
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
