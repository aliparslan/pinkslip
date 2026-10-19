import { queryKeys, useApi, useCompanies, useCompanyEvents, useCompanyPeople, useOpenPerson, usePreferences, useSession, useViewedJobs } from "@pinkslip/data";
import { ApiError, type CompanyEvent } from "@pinkslip/core/api";
import type { CompanyPerson } from "@pinkslip/domain/outreach";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import type { Job } from "@pinkslip/core/api";
import * as WebBrowser from "expo-web-browser";
import { Link, router, Stack, useSegments } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button, CompanyLogo, EmptyState, faces, Icon, PAGE_BAR, PageBar, RowPlaceholders, SectionHeader, Segmented, Text, toast, useTabBarScroll, useTabBarSpace } from "../../ui";
import { Text as RNText } from "react-native";
import { initials } from "./outreach/outreach-facts";
import { shortDate } from "./tracker-facts";
import { logoUri } from "../jobs/CompanyLogo";
import { toEventView } from "./event-facts";
import { EventRows } from "./EventPage";
import { fitsYourSearch, plainText, rowAge, rowFacts } from "./job-facts";

type Segment = "jobs" | "people" | "events";

/**
 * A company's page (Paper "Search and companies · Oct 12"): its logo and
 * name, Follow and its careers site, then Jobs, People and Events. Jobs
 * comes first, the ones that fit your search on top; rows drop the logo and
 * name, since every row is this company. People and Events are coming.
 */
export function CompanyPage({ companyId }: { companyId: string }) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const tabBarScroll = useTabBarScroll();
  const companies = useCompanies();
  const company = companies.data?.find((item) => item.id === companyId);
  const feed = useCompanyJobs(companyId, company?.name);
  const events = useCompanyEvents(companyId);
  const jobs = feed.jobs;
  const [segment, setSegment] = useState<Segment>("jobs");
  // People (O1, O13): the recruiters the owner confirmed here, and anyone
  // you've written to.
  const session = useSession().data;
  const people = useCompanyPeople(companyId, session?.state === "authenticated" && Boolean(session.me?.features?.outreach_enabled));
  const name = company?.name ?? jobs[0]?.company_name ?? "";
  const website = company?.website ?? (jobs[0]?.company_domain ? `https://${jobs[0].company_domain}` : null);

  return <>
  <ScrollView {...tabBarScroll} style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + PAGE_BAR, paddingBottom: tabSpace }}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.header}>
      <View style={styles.identity}>
        <CompanyLogo name={name || "?"} uri={logoUri(website)} size="page" />
        <View style={styles.name}>
          <Text role="title1" accessibilityRole="header">{plainText(name)}</Text>
          {website ? <Text role="subhead" tone="ink-2" lines={1}>{hostOf(website)}</Text> : null}
        </View>
      </View>
      <View style={styles.buttons}>
        <View style={styles.half}><Button fullWidth icon="add" disabled>Follow · Soon</Button></View>
        <View style={styles.half}>
          <Button fullWidth disabled={!website} onPress={() => website && void WebBrowser.openBrowserAsync(website, { controlsColor: theme.ui.color.accent })}>Careers site</Button>
        </View>
      </View>
      <View style={styles.segments}><Segmented value={segment} onChange={setSegment} segments={[
        { value: "jobs", label: "Jobs", count: feed.isSuccess ? jobs.length : undefined }, { value: "people", label: "People", count: people.data?.length || undefined }, { value: "events", label: "Events", count: events.data?.length || undefined },
      ]} /></View>
    </View>
    {segment === "people"
      ? <People people={people.data} pending={people.isPending && people.fetchStatus !== "idle"} company={plainText(name)} />
      : segment === "events"
      ? <CompanyEvents events={events.data} pending={events.isPending} company={plainText(name)} />
      : feed.isPending ? <RowPlaceholders lines={2} logo={false} />
      : <CompanyJobs jobs={jobs} />}
  </ScrollView>
  <PageBar />
  </>;
}

/** E1: the company's events as Coming up's rows, soonest first; E1b when
 * there are none. An event opens its page in the same tab. */
function CompanyEvents({ events, pending, company }: { events: CompanyEvent[] | undefined; pending: boolean; company: string }) {
  const queryClient = useQueryClient();
  const tab = (useSegments() as readonly string[])[1] ?? "(jobs)";
  if (pending) return <RowPlaceholders rows={3} />;
  if (!events?.length) return <EmptyState title="Nothing coming up" message={`${company}'s info sessions and fairs show up here.`} />;
  const byId = new Map(events.map((event) => [event.id, event]));
  return <EventRows events={events.map((event) => toEventView(event))} onOpen={(view) => {
    const event = byId.get(view.id);
    if (event) queryClient.setQueryData(queryKeys.personal.event(event.id), event);
    router.push({ pathname: `/(tabs)/${tab}/events/[eventId]` as "/(tabs)/(jobs)/events/[eventId]", params: { eventId: view.id } });
  }} />;
}

/** O1: a round avatar of initials, the name and title; someone you've
 * written to shows the paper plane and the date. O13 when there's no one.
 * Someone new opens as a draft to them, ready for "Write to". */
function People({ people, pending, company }: { people: CompanyPerson[] | undefined; pending: boolean; company: string }) {
  const tab = (useSegments() as readonly string[])[1] ?? "(jobs)";
  const open = useOpenPerson();
  if (pending) return <RowPlaceholders rows={3} />;
  if (!people?.length) {
    return <EmptyState title="No one listed yet" message={`People at ${company} show up here as Pinkslip finds them.`} />;
  }
  const show = (threadId: string) =>
    router.push({ pathname: `/(tabs)/${tab}/people/[threadId]` as "/(tabs)/(jobs)/people/[threadId]", params: { threadId } });
  return <View>{people.map((person) => {
    const sent = person.thread?.first_sent_at ?? null;
    return <Pressable key={person.id} accessibilityRole="button" disabled={open.isPending} style={({ pressed }) => [styles.person, pressed && styles.pressed]}
      onPress={() => person.thread ? show(person.thread.id) : open.mutate({ contactId: person.id }, {
        onSuccess: (thread) => show(thread.id),
        // The day's limit, or someone resting this week: the server says which.
        onError: (error) => toast.error(error instanceof ApiError && error.status < 500 ? error.message : "Couldn't open that. Try again."),
      })}>
      <View style={styles.avatar}><RNText style={styles.initials} maxFontSizeMultiplier={1.3}>{initials(person.name)}</RNText></View>
      <View style={styles.personText}>
        <View style={styles.line}>
          <Text weight="medium" lines={1} flex>{person.name}</Text>
          {sent ? <View style={styles.age}><Icon name="send" size={14} tone="ink-3" /><Text role="subhead" tone="ink-3">{shortDate(sent)}</Text></View> : null}
        </View>
        <Text role="subhead" tone="ink-2" lines={1}>{person.title}</Text>
      </View>
    </Pressable>;
  })}</View>;
}

/** Every open job at the company, across all its job sources (a company
 * can have more than one), newest first. */
function useCompanyJobs(companyId: string, name: string | undefined) {
  const api = useApi();
  const companies = useCompanies();
  const ids = useMemo(() => {
    const key = name?.trim().toLowerCase();
    const siblings = key ? (companies.data ?? []).filter((item) => item.name.trim().toLowerCase() === key).map((item) => item.id) : [];
    return siblings.length > 0 ? siblings : [companyId];
  }, [companies.data, companyId, name]);
  const results = useQueries({
    queries: ids.map((id) => ({ queryKey: ["company-jobs", id], queryFn: () => api.jobs.list({ company_id: id, limit: "100" }) })),
  });
  const jobs = useMemo(() => results.flatMap((result) => result.data?.jobs ?? [])
    .sort((a, b) => (b.posted_at ?? b.first_seen_at).localeCompare(a.posted_at ?? a.first_seen_at)), [results]);
  return { jobs, isPending: results.some((result) => result.isPending), isSuccess: results.every((result) => result.isSuccess) };
}

function CompanyJobs({ jobs }: { jobs: Job[] }) {
  const profile = usePreferences().data?.search_profile;
  const viewed = useViewedJobs();
  const fitting = jobs.filter((job) => fitsYourSearch(job, profile).length > 0);
  const others = jobs.filter((job) => !fitting.includes(job));
  if (jobs.length === 0) return <View style={styles.soon}><Text role="subhead" tone="ink-2" align="center">No open jobs here right now.</Text></View>;
  return <View>
    {fitting.length > 0 ? <SectionHeader title="Fits your search" count={fitting.length} first /> : null}
    {fitting.map((job) => <CompanyJobRow key={job.id} job={job} unread={!viewed.data?.has(job.id)} />)}
    {others.length > 0 ? <SectionHeader title={fitting.length > 0 ? "Other roles" : "Open roles"} count={others.length} first={fitting.length === 0} /> : null}
    {others.map((job) => <CompanyJobRow key={job.id} job={job} unread={!viewed.data?.has(job.id)} />)}
  </View>;
}

/** A job row without the logo or company: title and age, then the facts. */
function CompanyJobRow({ job, unread }: { job: Job; unread: boolean }) {
  const tab = (useSegments() as readonly string[])[1] ?? "(jobs)";
  const weight = unread ? "medium" : "regular";
  const stage = job.applied ? "Applied" : job.saved ? "Saved" : null;
  return <Link href={{ pathname: `/(tabs)/${tab}/jobs/[jobId]` as "/(tabs)/(jobs)/jobs/[jobId]", params: { jobId: job.id } }} asChild>
    <Pressable>
      {({ pressed }) => <View style={[styles.row, pressed && styles.pressed]}><View style={styles.rowText}>
        <View style={styles.line}>
          <Text role="subhead" weight={weight} lines={1} flex>{plainText(job.title)}</Text>
          <View style={styles.age}>
            <Text role="subhead" tone={unread ? "ink" : "ink-3"}>{rowAge(job)}</Text>
            {unread ? <View style={styles.dot} /> : null}
          </View>
        </View>
        <View style={styles.line}>
          <Text role="subhead" tone="ink-2" lines={1} flex>{rowFacts(job)}</Text>
          {stage ? <View style={styles.stage}>
            {stage === "Saved" ? <Icon name="saved" size={13} tone="ink-3" /> : null}
            <Text role="subhead" tone="ink-3">{stage}</Text>
          </View> : null}
        </View>
      </View></View>}
    </Pressable>
  </Link>;
}

const hostOf = (website: string) => website.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.ui.color.bg },
  header: { gap: theme.ui.space["4"], paddingHorizontal: theme.ui.size.gutter, paddingTop: theme.ui.space["2"], paddingBottom: theme.ui.space["1"] },
  identity: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["4"] },
  name: { flex: 1, gap: 2 },
  buttons: { flexDirection: "row", gap: theme.ui.space["2"] },
  half: { flex: 1 },
  segments: { marginTop: theme.ui.space["1"] },
  soon: { paddingHorizontal: theme.ui.space["8"], paddingVertical: theme.ui.space["10"], alignItems: "center" },
  row: { paddingLeft: theme.ui.size.gutter },
  rowText: {
    paddingVertical: theme.ui.space["3"], paddingRight: theme.ui.size.gutter,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.ui.color.separator,
  },
  line: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["2"] },
  age: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.ui.color.accent },
  stage: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["1"] },
  pressed: { backgroundColor: theme.ui.color.fill },
  person: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingLeft: theme.ui.size.gutter },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color.fill },
  initials: { fontFamily: faces.display, fontSize: 15, lineHeight: 18, color: theme.ui.color["ink-2"] },
  personText: {
    flex: 1, gap: 2, paddingVertical: theme.ui.space["3"], paddingRight: theme.ui.size.gutter,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.ui.color.separator,
  },
}));
