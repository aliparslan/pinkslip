import { useApi, useCompanies, usePreferences, useViewedJobs } from "@pinkslip/data";
import { useQueries } from "@tanstack/react-query";
import type { Job } from "@pinkslip/core/api";
import * as WebBrowser from "expo-web-browser";
import { Link, Stack, useSegments } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button, CompanyLogo, Icon, SectionHeader, Text, useTabBarSpace } from "../../ui";
import { logoUri } from "../jobs/CompanyLogo";
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
  const tabSpace = useTabBarSpace();
  const companies = useCompanies();
  const company = companies.data?.find((item) => item.id === companyId);
  const feed = useCompanyJobs(companyId, company?.name);
  const jobs = feed.jobs;
  const [segment, setSegment] = useState<Segment>("jobs");
  const name = company?.name ?? jobs[0]?.company_name ?? "";
  const website = company?.website ?? (jobs[0]?.company_domain ? `https://${jobs[0].company_domain}` : null);

  return <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: tabSpace }}>
    <Stack.Screen options={{ title: "", headerTintColor: theme.ui.color.ink }} />
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
      <Segments value={segment} onChange={setSegment} jobs={feed.isSuccess ? jobs.length : undefined} />
    </View>
    {segment !== "jobs"
      ? <View style={styles.soon}><Text role="subhead" tone="ink-2" align="center">{segment === "people" ? "Recruiters here are coming soon." : "Events are coming soon."}</Text></View>
      : feed.isPending ? <View style={styles.soon}><ActivityIndicator color={theme.ui.color["ink-3"]} /></View>
      : <CompanyJobs jobs={jobs} />}
  </ScrollView>;
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

function Segments({ value, onChange, jobs }: { value: Segment; onChange: (next: Segment) => void; jobs?: number }) {
  const items: { id: Segment; label: string; count?: number }[] = [{ id: "jobs", label: "Jobs", count: jobs }, { id: "people", label: "People" }, { id: "events", label: "Events" }];
  return <View style={styles.segments} accessibilityRole="tablist">
    {items.map((item) => <Pressable key={item.id} onPress={() => onChange(item.id)} accessibilityRole="tab" accessibilityState={{ selected: value === item.id }}
      style={[styles.segment, value === item.id && styles.segmentOn]}>
      <Text role="subhead" weight="medium" tone={value === item.id ? "ink" : "ink-2"}>{item.label}</Text>
      {item.count !== undefined ? <Text role="subhead" tone="ink-3">{item.count}</Text> : null}
    </Pressable>)}
  </View>;
}

function CompanyJobs({ jobs }: { jobs: Job[] }) {
  const profile = usePreferences().data?.search_profile;
  const viewed = useViewedJobs();
  const fitting = jobs.filter((job) => fitsYourSearch(job, profile).length > 0);
  const others = jobs.filter((job) => !fitting.includes(job));
  if (jobs.length === 0) return <View style={styles.soon}><Text role="subhead" tone="ink-2" align="center">No open jobs here right now.</Text></View>;
  return <View>
    {fitting.length > 0 ? <SectionHeader title="Fits your search" trailing={String(fitting.length)} /> : null}
    {fitting.map((job) => <CompanyJobRow key={job.id} job={job} unread={!viewed.data?.has(job.id)} />)}
    {others.length > 0 ? <SectionHeader title={fitting.length > 0 ? "Other roles" : "Open roles"} trailing={String(others.length)} /> : null}
    {others.map((job) => <CompanyJobRow key={job.id} job={job} unread={!viewed.data?.has(job.id)} />)}
  </View>;
}

/** A job row without the logo or company: title and age, then the facts. */
function CompanyJobRow({ job, unread }: { job: Job; unread: boolean }) {
  const tab = useSegments()[1] ?? "(jobs)";
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
  header: { gap: theme.ui.space["4"], paddingHorizontal: theme.ui.size.gutter, paddingTop: theme.ui.space["3"], paddingBottom: theme.ui.space["1"] },
  identity: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["4"] },
  name: { flex: 1, gap: 2 },
  buttons: { flexDirection: "row", gap: theme.ui.space["2"] },
  half: { flex: 1 },
  segments: { flexDirection: "row", height: 36, padding: 2, borderRadius: 18, backgroundColor: theme.ui.color.fill, marginTop: theme.ui.space["1"] },
  segment: { flex: 1, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", borderRadius: 16 },
  segmentOn: { backgroundColor: theme.ui.color["seg-on"], boxShadow: "0px 2px 6px rgba(0, 0, 0, 0.1)" },
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
}));
