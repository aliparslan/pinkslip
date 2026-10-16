import type { Application, ApplicationStage } from "@pinkslip/core/api";
import { useApplications, useInbox, useRemoveApplication, useSession, useUpdateApplication } from "@pinkslip/data";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Link, router, Stack } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { toast, usePullToRefresh } from "../../kit";
import {
  Chip, EmptyState, IconButton, JobRow, RowPlaceholders, SectionHeader, SheetHeader, SheetModal, SheetStep, StageMark, Text, useTabBarScroll, useTabBarSpace, type StageGroup,
} from "../../ui";
import { useSampleEmailTracking } from "../kit/email-sample";
import { logoUri } from "../jobs/CompanyLogo";
import { trackingState } from "./email/email-facts";
import { dismissNudge, useEmailTrackingPrefs } from "./email/email-prefs";
import { EmailSetupSheet, LiveEmailSetupSheet } from "./email/SetupSheet";
import { TrackerNudge } from "./email/TrackerNudge";
import {
  byWeek, companyName, groupApplications, jobTitle, MOVE_TO, STAGE_GROUPS, stageGroupLabels, trackerAge, trackerFacts,
} from "./tracker-facts";

export type TrackerView = "all" | StageGroup;

/** How many rows each stage shows under All; its header opens the rest. */
const PER_STAGE = 3;

type Item =
  | { kind: "stage"; key: string; group: StageGroup; count: number }
  | { kind: "section"; key: string; title: string; count: number }
  | { kind: "row"; key: string; application: Application };

/**
 * Tracker (Paper "Tracker · what we build now (TR2c)"): where every
 * application stands. All shows each stage's latest three under a header
 * that opens the stage ("Applied 142 ›"); a stage on its own splits into
 * this week and earlier. Rows make the company the headline. Stats is
 * coming soon, and says so.
 */
export function TrackerScreen({ initialView = "all", sample }: { initialView?: TrackerView; sample?: Application[] }) {
  const { theme } = useUnistyles();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const list = useRef<FlashListRef<Item>>(null);
  const tabBarScroll = useTabBarScroll(list);
  const chips = useRef<ScrollView>(null);
  const chipX = useRef(new Map<TrackerView, number>());
  const [view, setView] = useState<TrackerView>(initialView);
  // A new view starts at the top, with its chip in sight. The list's top
  // sits under the status bar's inset, so the top is that far above zero.
  // The first view is already there: iOS sets that inset itself.
  const shown = useRef(view);
  useEffect(() => {
    if (shown.current === view) return;
    shown.current = view;
    list.current?.scrollToOffset({ offset: -insets.top, animated: false });
    chips.current?.scrollTo({ x: Math.max(0, (chipX.current.get(view) ?? 0) - theme.ui.size.gutter), animated: true });
  }, [view, insets.top, theme.ui.size.gutter]);
  const [stats, setStats] = useState(false);
  const [setup, setSetup] = useState(false);
  const [sampleNudge, setSampleNudge] = useState(true);
  const signedIn = useSession().data?.state === "authenticated";
  const inbox = useInbox({ enabled: !sample && signedIn });
  const prefs = useEmailTrackingPrefs();
  const sampleTracking = useSampleEmailTracking("off");
  const applications = useApplications();
  const pull = usePullToRefresh(() => applications.refetch());

  // The redesign kit passes sample applications to show the screen full.
  const data = sample ?? applications.data;
  const groups = useMemo(() => groupApplications(data ?? []), [data]);
  const items = useMemo<Item[]>(() => {
    if (view !== "all") {
      return byWeek(groups.get(view) ?? []).flatMap((section): Item[] => [
        { kind: "section", key: `section-${section.title}`, title: section.title, count: section.applications.length },
        ...section.applications.map((application): Item => ({ kind: "row", key: application.id, application })),
      ]);
    }
    return STAGE_GROUPS.flatMap((group): Item[] => {
      const rows = groups.get(group) ?? [];
      if (rows.length === 0) return [];
      return [
        { kind: "stage", key: `stage-${group}`, group, count: rows.length },
        ...rows.slice(0, PER_STAGE).map((application): Item => ({ kind: "row", key: application.id, application })),
      ];
    });
  }, [groups, view]);

  const present = STAGE_GROUPS.filter((group) => (groups.get(group)?.length ?? 0) > 0);
  // Offered until email tracking is set up or put away (Paper 1B).
  const nudge = view === "all" && (data?.length ?? 0) > 0 && (sample
    ? sampleNudge
    : inbox.data !== undefined && trackingState(inbox.data, prefs.started) === "off" && !prefs.nudgeDismissed);
  const header = <View>
    <View style={styles.header}>
      <View style={styles.nav}><IconButton icon="stats" label="Stats" onPress={() => setStats(true)} /></View>
      <Text role="largeTitle" accessibilityRole="header">Tracker</Text>
    </View>
    {present.length > 0 ? <ScrollView ref={chips} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {(["all", ...present] as TrackerView[]).map((option) =>
        <View key={option} onLayout={(event) => chipX.current.set(option, event.nativeEvent.layout.x)}>
          <Chip label={option === "all" ? "All" : stageGroupLabels[option]} count={option === "all" ? undefined : groups.get(option)?.length}
            selected={view === option} onPress={() => setView(view === option ? "all" : option)} />
        </View>)}
    </ScrollView> : null}
    {nudge ? <TrackerNudge onSetUp={() => setSetup(true)} onDismiss={() => sample ? setSampleNudge(false) : dismissNudge()} /> : null}
  </View>;

  return <>
    <Stack.Screen options={{ headerShown: false }} />
    <FlashList ref={list} {...tabBarScroll} data={items} keyExtractor={(item) => item.key} getItemType={(item) => item.kind}
      contentInsetAdjustmentBehavior="automatic" style={styles.fill} contentContainerStyle={{ paddingBottom: tabSpace }}
      ListHeaderComponent={header}
      renderItem={({ item, index }) => item.kind === "stage"
        ? <SectionHeader title={stageGroupLabels[item.group]} count={item.count} leading={<StageMark stage={item.group} />}
          onPress={() => setView(item.group)} first={index === 0} />
        : item.kind === "section"
        ? <SectionHeader title={item.title} count={item.count} first={index === 0} />
        : <TrackerRow application={item.application} sample={Boolean(sample)} />}
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={theme.ui.color["ink-3"]} />}
      ListEmptyComponent={sample ? null : applications.isPending ? <RowPlaceholders /> : <View style={[styles.empty, { minHeight: height * 0.6 }]}>
        {applications.isError
          ? <EmptyState title="Tracker didn't load" message="Your applications are safe."
            action={{ label: "Try again", variant: "secondary", pending: applications.isFetching, onPress: () => void applications.refetch() }} />
          : <EmptyState slips title="Nothing here yet" message="Jobs you save or apply to show up here."
            action={{ label: "Browse jobs", onPress: () => router.navigate("/") }} />}
      </View>} />
    {sample
      ? <EmailSetupSheet open={setup} onClosed={() => setSetup(false)} inbox={sampleTracking.inbox} prefs={sampleTracking.prefs} actions={sampleTracking.actions} />
      : <LiveEmailSetupSheet open={setup} onClosed={() => setSetup(false)} />}
    <SheetModal open={stats} onClosed={() => setStats(false)}>
      <SheetStep id="stats">
        <SheetHeader title="Stats" />
        <Text tone="ink-2">Coming soon: how your applications move, week by week.</Text>
      </SheetStep>
    </SheetModal>
  </>;
}

/** A row opens its job; long-press moves it to another stage or removes it
 * (a native menu, text only). */
function TrackerRow({ application, sample }: { application: Application; sample: boolean }) {
  const update = useUpdateApplication();
  const remove = useRemoveApplication();
  const row = <JobRow headline="company" company={companyName(application)} title={jobTitle(application)}
    facts={trackerFacts(application)} age={trackerAge(application.stage_changed_at)}
    logo={{ name: application.company_name, uri: logoUri(application.job?.company_domain) }} />;
  // Samples have no pages to open, and a saved job that left the catalog has none either.
  if (sample || (!application.job_id && application.stage === "saved")) return row;
  const move = (stage: ApplicationStage) => update.mutate({ id: application.id, stage }, {
    onError: () => toast.error("Couldn't move it. Try again."),
  });
  const forget = () => remove.mutate({ id: application.id, jobId: application.job_id }, {
    onError: () => toast.error("Couldn't remove it. Try again."),
  });
  // Past Saved a row opens the application; a saved job has no stub yet.
  const href = application.stage === "saved" && application.job_id
    ? { pathname: "/(tabs)/(library)/jobs/[jobId]" as const, params: { jobId: application.job_id } }
    : { pathname: "/(tabs)/(library)/applications/[applicationId]" as const, params: { applicationId: application.id } };
  return <Link href={href} asChild>
    <Link.Trigger>{row}</Link.Trigger>
    <Link.Preview />
    <Link.Menu>
      <Link.Menu title="Move to">
        {MOVE_TO.map((option) => <Link.MenuAction key={option.stage} isOn={application.stage === option.stage}
          onPress={() => { if (application.stage !== option.stage) move(option.stage); }}>{option.label}</Link.MenuAction>)}
      </Link.Menu>
      <Link.MenuAction destructive onPress={forget}>Remove from Tracker</Link.MenuAction>
    </Link.Menu>
  </Link>;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.ui.color.bg },
  // The large title sits 8 under the 44 nav row, as on every tab.
  header: { gap: theme.ui.space["2"], paddingHorizontal: theme.ui.size.gutter },
  nav: { height: theme.ui.size.iconButton, flexDirection: "row", justifyContent: "flex-end", alignItems: "center" },
  chips: { gap: theme.ui.space["2"], paddingHorizontal: theme.ui.size.gutter, paddingTop: theme.ui.space["3"], paddingBottom: theme.ui.space["2"] },
  // Centred in the room under the header, not tucked under the title.
  empty: { justifyContent: "center" },
}));
