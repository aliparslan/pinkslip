import type { Job } from "@pinkslip/core/api";
import { FlashList } from "@shopify/flash-list";
import { Stack } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { Button, closeOpenSwipeRow, PAGE_BAR, PageBar, Text, useTabBarSpace } from "../../ui";
import type { JobActions } from "../jobs/useJobActions";
import { FeedRow } from "../redesign/JobsFeed";

/**
 * Dev-only: the Jobs feed's own rows (FeedRow, in a FlashList as on Jobs) on
 * sample jobs, so a swipe can be tried and recorded all the way through:
 * Save and Read toggle, Applied marks, Hide takes the row away. Nothing
 * leaves the phone. Reset brings every row back.
 */
const COMPANIES: [string, string, string, string, string | null][] = [
  ["Stripe", "stripe.com", "Software Engineer, New Grad", "New York, NY", "$165,000"],
  ["Ramp", "ramp.com", "Frontend Engineer", "New York, NY", "$150,000 - $190,000"],
  ["Linear", "linear.app", "Product Engineer", "Remote", "$140,000"],
  ["Notion", "notion.so", "Software Engineer, Early Career", "San Francisco, CA", "$155,000"],
  ["Figma", "figma.com", "Design Engineer", "San Francisco, CA", null],
  ["Mercury", "mercury.com", "Backend Engineer", "Remote", "$145,000"],
  ["Vercel", "vercel.com", "Developer Advocate", "Remote", null],
  ["Plaid", "plaid.com", "Software Engineer I", "Salt Lake City, UT", "$130,000"],
  ["Retool", "retool.com", "Full Stack Engineer", "San Francisco, CA", "$160,000"],
  ["Datadog", "datadoghq.com", "Software Engineer, New Grad", "Boston, MA", "$150,000"],
];

function sampleJobs(now = Date.now()): Job[] {
  return COMPANIES.map(([company, domain, title, location, salary], index) => ({
    id: `swipe-sample-${index}`, company_id: `sample-${domain}`, external_id: String(index), title, url: `https://${domain}`, location,
    department: null, posted_at: new Date(now - (index + 1) * 3 * 3600_000).toISOString(), first_seen_at: new Date(now - (index + 1) * 3 * 3600_000).toISOString(),
    evergreen: 0, dismissed: 0, description: null, salary, closed_at: null, company_name: company, company_domain: domain,
  }));
}

export function SwipeFeedLab() {
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const [jobs, setJobs] = useState(() => sampleJobs());
  const [viewed, setViewed] = useState(new Set<string>());
  const patch = (id: string, change: Partial<Job>) => setJobs((all) => all.map((job) => (job.id === id ? { ...job, ...change } : job)));
  const actions = useMemo<JobActions>(() => ({
    save: (job) => patch(job.id, { saved: true }),
    unsave: (job) => patch(job.id, { saved: false }),
    markApplied: (job) => patch(job.id, { applied: true }),
    unmarkApplied: (job) => patch(job.id, { applied: false }),
    toggleRead: (job, read) => setViewed((all) => { const next = new Set(all); if (read) next.add(job.id); else next.delete(job.id); return next; }),
    hide: (job) => setJobs((all) => all.filter((other) => other.id !== job.id)),
  }), []);
  return <View style={styles.screen}>
    <Stack.Screen options={{ headerShown: false }} />
    <FlashList data={jobs} keyExtractor={(job) => job.id} onScrollBeginDrag={closeOpenSwipeRow}
      contentContainerStyle={{ paddingTop: insets.top + PAGE_BAR + 8, paddingBottom: tabSpace }}
      ListHeaderComponent={<View style={styles.header}>
        <Text role="title1" accessibilityRole="header">Swipes</Text>
        <Text role="subhead" tone="ink-2">The feed's rows on sample jobs. Save, Read and Applied toggle; Hide takes the row away.</Text>
        <Button variant="secondary" onPress={() => { setJobs(sampleJobs()); setViewed(new Set()); }}>Reset</Button>
      </View>}
      renderItem={({ item }) => <FeedRow job={item} viewed={viewed.has(item.id)} actions={actions} tab="(you)" onOpen={() => undefined} />} />
    <PageBar />
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.ui.color.bg },
  header: { gap: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter, paddingBottom: theme.ui.space["4"], alignItems: "flex-start" },
}));
