import type { Application, ApplicationStage } from "@pinkslip/core/api";
import { useApplications, useInbox, useOutreachThreads, useRemoveApplication, useSession, useUpdateApplication } from "@pinkslip/data";
import type { OutreachThread } from "@pinkslip/domain/outreach";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { Link, router, Stack } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshControl, ScrollView, useWindowDimensions, View } from "react-native";
import Animated, { Easing, FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { usePullToRefresh } from "../../kit";
import {
  Chip, EMPTY_TOP, EmptyState, glyphMenuAction, IconButton, JobRow, RowPlaceholders, SectionHeader, SheetHeader, SheetModal, SheetStep, StageMark, Text, toast, TopEdgeBlur, useTabBarScroll,
  useTabBarSpace, useTopEdge, type StageGroup,
} from "../../ui";
import { useSampleEmailTracking } from "../kit/email-sample";
import { logoUri } from "../jobs/CompanyLogo";
import { trackingState } from "./email/email-facts";
import { dismissNudge, useEmailTrackingPrefs } from "./email/email-prefs";
import { EmailSetupSheet, LiveEmailSetupSheet } from "./email/SetupSheet";
import { TrackerNudge } from "./email/TrackerNudge";
import { useMotionTrial } from "../../ui/motion-trial";
import { trackerOutreachLine } from "./outreach/outreach-facts";
import {
  byWeek, companyName, groupApplications, jobTitle, MOVE_TO, STAGE_GROUPS, stageGroupLabels, trackerAge, trackerFacts,
} from "./tracker-facts";

export type TrackerView = "all" | StageGroup;

/** How many rows each stage shows under All; its header opens the rest. */
const PER_STAGE = 3;
/** Tracker's first rows arrive as one: chips, headers and rows fade in
 * together over 200ms, a beat after the placeholders have gone (flow run
 * 2.7; Paper "4 · Tracker loads in place", 2026-11-08). Only what renders
 * as they arrive fades; rows scrolled to later don't. */
const ROWS_IN = FadeIn.delay(80).duration(200).easing(Easing.bezier(0.23, 1, 0.32, 1));
const ARRIVING_MS = 300;

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
  const edge = useTopEdge();
  const tabBarScroll = useTabBarScroll(list, edge);
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
  const session = useSession().data;
  const signedIn = session?.state === "authenticated";
  // Who you emailed at a company shows on its application's row (O7).
  const threads = useOutreachThreads(signedIn && !sample && Boolean(session?.me?.features?.outreach_enabled));
  const byJob = useMemo(() => new Map((threads.data ?? []).filter((thread) => thread.job_id).map((thread) => [thread.job_id!, thread])), [threads.data]);
  const inbox = useInbox({ enabled: !sample && signedIn });
  const prefs = useEmailTrackingPrefs();
  const sampleTracking = useSampleEmailTracking("off");
  const applications = useApplications();
  const pull = usePullToRefresh(() => applications.refetch());
  const settles = useMotionTrial("trackerLoad") && !sample;
  // When the first load lands, read as it renders so its rows fade in.
  const loading = useRef(applications.isPending);
  const arrivedAt = useRef(0);
  if (loading.current && !applications.isPending) arrivedAt.current = Date.now();
  loading.current = applications.isPending;
  const arriving = settles && Date.now() - arrivedAt.current < ARRIVING_MS;
  const entering = arriving ? ROWS_IN : undefined;

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
      {/* Stats once there's something to count; the row keeps its height. */}
      <View style={styles.nav}>{(data?.length ?? 0) > 0 ? <IconButton icon="stats" label="Stats" onPress={() => setStats(true)} /> : null}</View>
      <Text role="largeTitle" accessibilityRole="header">Tracker</Text>
    </View>
    {present.length > 0 ? <Animated.View entering={entering}><ScrollView ref={chips} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {(["all", ...present] as TrackerView[]).map((option) =>
        <View key={option} onLayout={(event) => chipX.current.set(option, event.nativeEvent.layout.x)}>
          <Chip label={option === "all" ? "All" : stageGroupLabels[option]} count={option === "all" ? undefined : groups.get(option)?.length}
            selected={view === option} onPress={() => setView(view === option ? "all" : option)} />
        </View>)}
    </ScrollView></Animated.View> : null}
    {nudge ? <Animated.View entering={entering}><TrackerNudge onSetUp={() => setSetup(true)} onDismiss={() => sample ? setSampleNudge(false) : dismissNudge()} /></Animated.View> : null}
  </View>;

  return <>
    <Stack.Screen options={{ headerShown: false }} />
    <FlashList ref={list} {...tabBarScroll} data={items} keyExtractor={(item) => item.key} getItemType={(item) => item.kind}
      contentInsetAdjustmentBehavior="automatic" style={styles.fill} contentContainerStyle={{ paddingBottom: tabSpace }}
      ListHeaderComponent={header}
      renderItem={({ item, index }) => <Animated.View entering={entering}>{item.kind === "stage"
        ? <SectionHeader title={stageGroupLabels[item.group]} count={item.count} leading={<StageMark stage={item.group} />}
          onPress={() => setView(item.group)} first={index === 0} />
        : item.kind === "section"
        ? <SectionHeader title={item.title} count={item.count} first={index === 0} />
        : <TrackerRow application={item.application} sample={Boolean(sample)} thread={item.application.job_id ? byJob.get(item.application.job_id) : undefined} />}</Animated.View>}
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={theme.ui.color["ink-3"]} />}
      ListEmptyComponent={sample ? null : applications.isPending ? <RowPlaceholders chips={settles} giveWay={settles} /> : <View style={[styles.empty, { paddingTop: height * EMPTY_TOP }]}>
        {applications.isError
          ? <EmptyState title="Tracker didn't load" message="Your applications are safe."
            action={{ label: "Try again", variant: "secondary", pending: applications.isFetching, onPress: () => void applications.refetch() }} />
          : <EmptyState slips title="Nothing yet" message="Jobs you save or apply to show up here."
            action={{ label: "Browse jobs", onPress: () => router.navigate("/") }} />}
      </View>} />
    <TopEdgeBlur under={edge.under} />
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
function TrackerRow({ application, sample, thread }: { application: Application; sample: boolean; thread?: OutreachThread }) {
  const update = useUpdateApplication();
  const remove = useRemoveApplication();
  const outreach = thread && application.stage !== "saved" ? trackerOutreachLine(thread) : null;
  const row = <JobRow headline="company" company={companyName(application)} title={jobTitle(application)}
    facts={outreach ?? trackerFacts(application)} age={trackerAge(application.stage_changed_at)}
    logo={{ name: application.company_name, uri: logoUri(application.company_domain ?? application.job?.company_domain) }} />;
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
      <Link.Menu inline title="">
        {glyphMenuAction({ id: "remove", title: "Remove from Tracker", glyph: "remove", destructive: true, onSelect: forget })}
      </Link.Menu>
    </Link.Menu>
  </Link>;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.ui.color.bg },
  // The large title sits 8 under the 44 nav row, as on every tab.
  header: { gap: theme.ui.space["2"], paddingHorizontal: theme.ui.size.gutter },
  nav: { height: theme.ui.size.iconButton, flexDirection: "row", justifyContent: "flex-end", alignItems: "center" },
  chips: { gap: theme.ui.space["2"], paddingHorizontal: theme.ui.size.gutter, paddingTop: theme.ui.space["3"], paddingBottom: theme.ui.space["2"] },
  // Set from the top at Today's height, so the picture stays put between tabs.
  empty: {},
}));
