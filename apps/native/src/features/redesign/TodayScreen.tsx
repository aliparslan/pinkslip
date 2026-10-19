import type { Application, InboundEmail } from "@pinkslip/core/api";
import { feedParams } from "@pinkslip/core/feed-criteria";
import { useAssignInboundEmail, useDismissInboundEmail, useFeed, useMarkTodaySeen, useToday } from "@pinkslip/data";
import type { OutreachThread } from "@pinkslip/domain/outreach";
import { router, Stack, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, useWindowDimensions, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { toast, usePullToRefresh } from "../../kit";
import { DateTile, EmptyState, Icon, JobRow, RowPlaceholders, SectionHeader, Text, useTabBarScroll, useTabBarSpace } from "../../ui";
import { useFeedCriteria } from "../feed/Feed";
import { logoUri } from "../jobs/CompanyLogo";
import { LiveEmailSetupSheet } from "./email/SetupSheet";
import { WhichApplicationSheet } from "./email/JobEmailsPage";
import { feedSections } from "./job-facts";
import { ASK_SAMPLE, AskFirstCard } from "./apply-flow/AskFirst";
import { LiveBar, type Run } from "./apply-flow/WhileItRuns";
import { setAppBadge } from "../../platform/push";
import { planFromToday, planToday, type TodayItem, type TodayPlan, type TodayTarget } from "./today-facts";

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

/** The live screen reads the server's Today; samples plan from their records. */
function useTodayPlan(sample?: TodaySample) {
  const today = useToday(!sample);
  const plan = useMemo<TodayPlan>(() => sample
    ? planToday(sample.applications, sample.emails, new Date(), sample.threads)
    : today.data ? planFromToday(today.data) : { needsYou: [], changed: [], comingUp: [] }, [sample, today.data]);
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
  const tabBarScroll = useTabBarScroll();
  const { plan, today } = useTodayPlan(sample);
  const markSeen = useMarkTodaySeen();
  const newToday = useNewToday();
  const [asking, setAsking] = useState<InboundEmail | null>(null);
  const [setup, setSetup] = useState(false);
  const [run, setRun] = useState<Run>(() => ({
    now: ASK_SAMPLE[1]!, next: ASK_SAMPLE.slice(2, 8), sent: [{ job: ASK_SAMPLE[0]!, confirmed: true }, { job: ASK_SAMPLE[5]!, confirmed: false }], done: 3, total: 9,
  }));
  const assign = useAssignInboundEmail();
  const dismiss = useDismissInboundEmail();
  const pull = usePullToRefresh(() => today.refetch());
  useFocusEffect(useCallback(() => {
    if (!sample) markSeen.mutate();
  }, [sample, markSeen.mutate]));

  const open = (target: TodayTarget) => {
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
    ? <View style={[styles.center, { minHeight: height * 0.6 }]}>
      <EmptyState title="Today didn't load" message="Your applications are safe."
        action={{ label: "Try again", variant: "secondary", pending: today.isFetching, onPress: () => void today.refetch() }} />
    </View>
    : nothing
    ? <View style={[styles.center, { minHeight: height * 0.6 }]}>
      <EmptyState slips title="Nothing yet" message="Save a job or apply to one, and your day shows up here."
        action={{ label: "Browse jobs", onPress: () => router.navigate("/") }}
        secondary={{ label: "Track one from an email", onPress: () => setSetup(true) }} />
    </View>
    : <>
      {sample?.flow === "ask" ? <View style={styles.askFirst}><AskFirstCard jobs={ASK_SAMPLE} onReview={() => router.push("/you/kit-review")} /></View> : null}
      {quiet && newToday ? <NewJobsRow count={newToday} /> : null}
      {sections.map((section, index) => <View key={section.title}>
        <SectionHeader title={section.title} count={section.items.length} needsYou={section.needsYou} first={index === 0 && !(quiet && newToday)} />
        {section.items.map((item) => <TodayRow key={item.key} item={item} needsYou={section.needsYou} onPress={() => open(item.target)} />)}
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
    <WhichApplicationSheet email={asking} onClosed={() => setAsking(null)} actions={sample ? {
      assign: async () => { toast.success("Filed"); },
      dismiss: async () => undefined,
    } : {
      assign: async (emailId, applicationIds) => { await assign.mutateAsync({ emailId, applicationIds }); },
      dismiss: async (emailId) => { await dismiss.mutateAsync(emailId); },
    }} />
    <LiveEmailSetupSheet open={setup} onClosed={() => setSetup(false)} />
    {sample?.flow === "sending" ? <LiveBar roomGiven run={run} onPause={() => setRun((current) => ({ ...current, paused: !current.paused }))} /> : null}
  </>;
}

function TodayRow({ item, needsYou, onPress }: { item: TodayItem; needsYou?: boolean; onPress: () => void }) {
  return <JobRow headline="news" company={item.company} title={item.headline} facts={item.facts} age={item.trailing} needsYou={needsYou}
    leading={item.date ? <DateTile month={item.date.month} day={item.date.day} /> : undefined}
    logo={item.logo ? { name: item.logo.name, uri: logoUri(item.logo.domain ?? undefined) } : undefined} onPress={onPress} />;
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
  fill: { flex: 1, backgroundColor: theme.ui.color.bg },
  // The date sits in the 44 nav row; the large title 8 under it, as on every tab.
  header: { gap: theme.ui.space["2"], paddingHorizontal: theme.ui.size.gutter },
  nav: { height: theme.ui.size.iconButton, justifyContent: "flex-end" },
  center: { justifyContent: "center" },
  askFirst: { marginTop: theme.ui.space["2"], marginBottom: theme.ui.space["2"] },
  flex: { flex: 1 },
  newJobs: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingVertical: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter, marginTop: theme.ui.space["2"] },
  newJobsTile: {
    width: theme.ui.size.logo, height: theme.ui.size.logo, borderRadius: theme.ui.size.logo / 4, borderCurve: "continuous",
    alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color.fill,
  },
  pressed: { backgroundColor: theme.ui.color.fill },
}));
