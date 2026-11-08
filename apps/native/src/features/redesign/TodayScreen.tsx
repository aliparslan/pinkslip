import type { Application, InboundEmail } from "@pinkslip/core/api";
import { feedParams } from "@pinkslip/core/feed-criteria";
import { useAssignInboundEmail, useDismissInboundEmail, useDropWaiting, useFeed, useMarkTodaySeen, useToday } from "@pinkslip/data";
import type { OutreachThread } from "@pinkslip/domain/outreach";
import { Link, router, Stack, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { usePullToRefresh } from "../../kit";
import { DateTile, EMPTY_TOP, EmptyState, Icon, JobRow, RowPlaceholders, SectionHeader, SwipeRow, Text, toast, TopEdgeBlur, useTabBarScroll, useTabBarSpace, useTopEdge } from "../../ui";
import { useMotionTrial } from "../../ui/motion-trial";
import { useFeedCriteria } from "../feed/Feed";
import { logoUri } from "../jobs/CompanyLogo";
import { LiveEmailSetupSheet } from "./email/SetupSheet";
import { WhichApplicationSheet } from "./email/JobEmailsPage";
import { feedSections } from "./job-facts";
import { ASK_SAMPLE, AskFirstCard, StackedLogos } from "./apply-flow/AskFirst";
import { WaitingSheetModal } from "./sends/WaitingSends";
import { LiveBar, type LiveQueue } from "./apply-flow/WhileItRuns";
import { setAppBadge } from "../../platform/push";
import { storage } from "../../platform/storage";
import { planFromToday, planToday, sinceLastLook, type TodayItem, type TodayPlan, type TodayTarget } from "./today-facts";

/** The Today tab's badge: how many things need you. The server counts them
 * (GET /today), and the app icon shows the same number. */
export function useTodayNeedsYou(): number {
  const today = useToday();
  const badge = today.data?.badge;
  useEffect(() => { if (badge !== undefined) setAppBadge(badge); }, [badge]);
  return badge ?? 0;
}

export interface TodaySample {
  applications: Application[];
  emails: InboundEmail[];
  threads?: OutreachThread[];
  /** Ask first's card (3.1), or the live bar while it sends (4.1): sample only
   * until auto-apply's queue is on the backend. */
  flow?: "ask" | "sending";
}

/** When Today was last left on this phone: leaving it, or the app, while it shows. */
const LAST_LOOK = "today-last-look";

/** The last look before this visit, for What changed (sinceLastLook). It's
 * read as Today comes into view and written as it goes, so a visit's list
 * holds still while you're on it. */
function useLastLook(enabled: boolean): number | null {
  const read = () => storage.getNumber(LAST_LOOK) ?? null;
  const [lastLook, setLastLook] = useState<number | null>(read);
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    if (!enabled) return;
    focused.current = true;
    setLastLook(read());
    return () => { focused.current = false; storage.set(LAST_LOOK, Date.now()); };
  }, [enabled]));
  useEffect(() => {
    if (!enabled) return;
    const change = AppState.addEventListener("change", (state) => {
      if (!focused.current) return;
      if (state === "background") storage.set(LAST_LOOK, Date.now());
      else if (state === "active") setLastLook(read());
    });
    return () => change.remove();
  }, [enabled]);
  return lastLook;
}

/** The live screen reads the server's Today; samples plan from their records. */
function useTodayPlan(sample?: TodaySample) {
  const today = useToday(!sample);
  const lastLook = useLastLook(!sample);
  const plan = useMemo<TodayPlan>(() => {
    if (sample) return planToday(sample.applications, sample.emails, new Date(), sample.threads);
    if (!today.data) return { needsYou: [], changed: [], comingUp: [] };
    const live = planFromToday(today.data);
    return { ...live, changed: sinceLastLook(live.changed, lastLook) };
  }, [sample, today.data, lastLook]);
  return { plan, today };
}

/** How many of your feed's jobs posted today, from the page Jobs already
 * loads; "20+" when the first page is all today's. */
function useNewToday(): string | null {
  const criteria = useFeedCriteria();
  const params = useMemo(() => feedParams(criteria.search, criteria.available, criteria.defaults), [criteria.search, criteria.available, criteria.defaults]);
  const feed = useFeed(params, criteria.preferences.isSuccess);
  const jobs = feed.data?.pages.flatMap((page) => page.jobs) ?? [];
  const today = feedSections(jobs)[0];
  if (!today || today.title !== "New today") return null;
  const more = today.jobs.length === jobs.length && feed.hasNextPage;
  return `${today.jobs.length}${more ? "+" : ""}`;
}

/** "Thursday, October 15", the nav row's eyebrow. */
function longDate(now: Date): string {
  return now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

/**
 * Today (Paper "Approved", T1r, T3r and T4): what needs you, what changed,
 * and what's coming up, as plain rows with one headline each. A quiet day
 * has no statement, only the new jobs and what's coming. The first day is
 * the empty state. Auto-apply's card and follow-ups come with their
 * features. Opening it marks it seen on every device.
 */
export function TodayScreen({ sample }: { sample?: TodaySample } = {}) {
  const { theme } = useUnistyles();
  const { height } = useWindowDimensions();
  const tabSpace = useTabBarSpace();
  const list = useRef<ScrollView>(null);
  const edge = useTopEdge();
  const tabBarScroll = useTabBarScroll(undefined, edge);
  const { plan, today } = useTodayPlan(sample);
  const markSeen = useMarkTodaySeen();
  const newToday = useNewToday();
  const [asking, setAsking] = useState<InboundEmail | null>(null);
  const [setup, setSetup] = useState(false);
  // The kit's run of nine (Paper 4.1), paused and resumed with its button.
  const [paused, setPaused] = useState(false);
  const run: LiveQueue = {
    now: ASK_SAMPLE[1]!, next: ASK_SAMPLE.slice(2, 8), sent: [{ job: ASK_SAMPLE[0]!, confirmed: true }, { job: ASK_SAMPLE[5]!, confirmed: false }],
  };
  const assign = useAssignInboundEmail();
  const dismiss = useDismissInboundEmail();
  const drop = useDropWaiting();
  // Stopped sends' one sheet, from their row or their push (`?answer=sends`).
  const [waiting, setWaiting] = useState(false);
  const { answer } = useLocalSearchParams<{ answer?: string }>();
  useEffect(() => {
    if (answer !== "sends" || sample) return;
    setWaiting(true);
    router.setParams({ answer: undefined });
  }, [answer, sample]);
  const pull = usePullToRefresh(() => today.refetch());
  useFocusEffect(useCallback(() => {
    if (!sample) markSeen.mutate();
  }, [sample, markSeen.mutate]));

  const open = (target: TodayTarget) => {
    if (target.kind === "waiting") return sample ? toast.show({ message: "A sample: nothing is waiting", icon: "autoApply" }) : setWaiting(true);
    if (target.kind === "email") setAsking(target.email);
    else if (target.kind === "person") router.push({ pathname: "/(tabs)/(today)/people/[threadId]", params: { threadId: target.id } });
    // Samples have no pages to open.
    else if (sample) return;
    else if (target.kind === "job") router.push({ pathname: "/(tabs)/(today)/jobs/[jobId]", params: { jobId: target.id } });
    else if (target.kind === "event") router.push({ pathname: "/(tabs)/(today)/events/[eventId]", params: { eventId: target.id } });
    else router.push({ pathname: "/(tabs)/(today)/applications/[applicationId]", params: { applicationId: target.id } });
  };

  const quiet = plan.needsYou.length === 0 && plan.changed.length === 0;
  const nothing = quiet && plan.comingUp.length === 0 && (sample ? sample.applications.length : today.data?.tracking ?? 0) === 0;
  const sections: { title: string; items: TodayItem[]; needsYou?: boolean }[] = [
    { title: "Needs you", items: plan.needsYou, needsYou: true },
    { title: "What changed", items: plan.changed },
    { title: "Coming up", items: plan.comingUp },
  ].filter((section) => section.items.length > 0);

  const body = today.isPending && !sample
    ? <RowPlaceholders />
    : today.isError && !sample
    ? <View style={[styles.center, { paddingTop: height * EMPTY_TOP }]}>
      <EmptyState title="Today didn't load" message="Your applications are safe."
        action={{ label: "Try again", variant: "secondary", pending: today.isFetching, onPress: () => void today.refetch() }} />
    </View>
    : nothing
    ? <View style={[styles.center, { paddingTop: height * EMPTY_TOP }]}>
      <EmptyState slips title="Nothing yet" message="Save a job or apply to one, and your day shows up here."
        action={{ label: "Browse jobs", onPress: () => router.navigate("/") }}
        secondary={{ label: "Track one from an email", onPress: () => setSetup(true) }} />
    </View>
    : <>
      {sample?.flow === "ask" ? <View style={styles.askFirst}><AskFirstCard jobs={ASK_SAMPLE} onReview={() => router.push("/you/kit-review")} /></View> : null}
      {quiet && newToday ? <NewJobsRow count={newToday} /> : null}
      {sections.map((section, index) => <View key={section.title}>
        <SectionHeader title={section.title} count={section.items.length} needsYou={section.needsYou} first={index === 0 && !(quiet && newToday)} />
        {section.items.map((item) => item.target.kind === "waiting"
          // W4: Don't send drops them all, the way Hide drops a job.
          ? <SwipeRow key={item.key} id={item.key} trailing={[{
            id: "drop", label: "Don't send", icon: "close", tone: "neutral", removes: true,
            run: () => (sample ? undefined : drop.mutate(undefined, { onError: () => toast.error("Couldn't drop them. Try again.") })),
          }]}>
            <TodayRow item={item} needsYou={section.needsYou} onPress={() => open(item.target)} />
          </SwipeRow>
          : <TodayRow key={item.key} item={item} needsYou={section.needsYou} href={sample ? null : pageOf(item.target)} onPress={() => open(item.target)} />)}
      </View>)}
    </>;

  return <>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView ref={list} {...tabBarScroll} contentInsetAdjustmentBehavior="automatic" style={styles.fill}
      contentContainerStyle={{ paddingBottom: tabSpace }}
      refreshControl={<RefreshControl refreshing={pull.refreshing} onRefresh={pull.onRefresh} tintColor={theme.ui.color["ink-3"]} />}>
      <View style={styles.header}>
        <View style={styles.nav}><Text role="subhead" weight="medium" tone="ink-3">{longDate(new Date())}</Text></View>
        <Text role="largeTitle" accessibilityRole="header">Today</Text>
      </View>
      {body}
    </ScrollView>
    <TopEdgeBlur under={edge.under} />
    <WhichApplicationSheet email={asking} onClosed={() => setAsking(null)} actions={sample ? {
      assign: async () => { toast.success("Filed"); },
      dismiss: async () => undefined,
    } : {
      assign: async (emailId, applicationIds) => { await assign.mutateAsync({ emailId, applicationIds }); },
      dismiss: async (emailId) => { await dismiss.mutateAsync(emailId); },
    }} />
    <LiveEmailSetupSheet open={setup} onClosed={() => setSetup(false)} />
    {sample ? null : <WaitingSheetModal open={waiting} onClosed={() => setWaiting(false)} />}
    {sample?.flow === "sending" ? <View pointerEvents="box-none" style={[styles.liveBar, { bottom: tabSpace - 4 }]}>
      <LiveBar queue={run} onPause={() => setPaused(!paused)}
        state={paused ? { kind: "paused", count: "3 of 9", share: 3 / 9 } : { kind: "sending", company: run.now!.company, count: "3 of 9", share: 3 / 9 }} />
    </View> : null}
  </>;
}

/** The page a row opens, for those that open one. */
function pageOf(target: TodayTarget): Href | null {
  if (target.kind === "job") return { pathname: "/(tabs)/(today)/jobs/[jobId]", params: { jobId: target.id } };
  if (target.kind === "event") return { pathname: "/(tabs)/(today)/events/[eventId]", params: { eventId: target.id } };
  if (target.kind === "person") return { pathname: "/(tabs)/(today)/people/[threadId]", params: { threadId: target.id } };
  if (target.kind === "application") return { pathname: "/(tabs)/(today)/applications/[applicationId]", params: { applicationId: target.id } };
  return null;
}

/** A row's page grows out of it, as on Jobs and Tracker (Kit → Motion fixes). */
function TodayRow({ item, needsYou, href, onPress }: { item: TodayItem; needsYou?: boolean; href?: Href | null; onPress: () => void }) {
  const zoom = useMotionTrial("todayZoom");
  const opensPage = zoom && href;
  const row = <JobRow headline="news" company={item.company} title={item.headline} facts={item.facts} age={item.trailing} needsYou={needsYou}
    leading={item.date ? <DateTile month={item.date.month} day={item.date.day} />
      : item.logos ? <StackedLogos first={item.logos[0]} second={item.logos[1]} ring="bg" /> : undefined}
    logo={item.logo ? { name: item.logo.name, uri: logoUri(item.logo.domain ?? undefined) } : undefined} onPress={opensPage ? undefined : onPress} />;
  return opensPage ? <Link href={href} asChild><Link.Trigger withAppleZoom>{row}</Link.Trigger></Link> : row;
}

/** A quiet day's way into Jobs (T3): the count of today's new jobs. */
function NewJobsRow({ count }: { count: string }) {
  return <Pressable accessibilityRole="button" onPress={() => router.navigate("/")}
    style={({ pressed }) => [styles.newJobs, pressed && styles.pressed]}>
    <View style={styles.newJobsTile}><Icon name="jobs" size={24} tone="ink-2" /></View>
    <View style={styles.flex}><Text weight="medium">{count === "1" ? "1 new job today" : `${count} new jobs today`}</Text></View>
    <Icon name="disclosure" size={12} tone="ink-4" />
  </Pressable>;
}

const styles = StyleSheet.create((theme) => ({
  // The kit's live bar, where the tab bar's would ride.
  liveBar: { position: "absolute", left: theme.ui.size.gutter, right: theme.ui.size.gutter },
  fill: { flex: 1, backgroundColor: theme.ui.color.bg },
  // The date sits in the 44 nav row; the large title 8 under it, as on every tab.
  header: { gap: theme.ui.space["2"], paddingHorizontal: theme.ui.size.gutter },
  nav: { height: theme.ui.size.iconButton, justifyContent: "flex-end" },
  // Set from the top, not centred: Today's empty state has one more line
  // than Tracker's, so centring put its picture 30 higher (2026-11-04).
  center: {},
  askFirst: { marginTop: theme.ui.space["2"], marginBottom: theme.ui.space["2"] },
  flex: { flex: 1 },
  newJobs: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingVertical: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter, marginTop: theme.ui.space["2"] },
  newJobsTile: {
    width: theme.ui.size.logo, height: theme.ui.size.logo, borderRadius: theme.ui.size.logo / 4, borderCurve: "continuous",
    alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color.fill,
  },
  pressed: { backgroundColor: theme.ui.color.fill },
}));
