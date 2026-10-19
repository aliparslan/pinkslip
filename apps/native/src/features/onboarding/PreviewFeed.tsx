import type { Job } from "@pinkslip/core/api";
import type { Profile } from "@pinkslip/core/profile-fields";
import { useEffect, useMemo } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import Animated, {
  LinearTransition, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSpring, withTiming, type EntryExitAnimationFunction,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { Chip, IconButton, JobRow, RowPlaceholders, SearchField, SectionHeader, Text } from "../../ui";
import { motion, spring } from "../../ui/motion";
import { logoUri } from "../jobs/CompanyLogo";
import { feedSections, plainText, rowAge, rowFacts } from "../redesign/job-facts";
import { stageName, STAGES_IN_ORDER } from "../redesign/search-draft";
import { fitsAnswers } from "./answers";

const { feed: FEED, leave: LEAVE } = motion.onboarding;
const ROW_SPRING = spring(FEED);
/** Enough rows to fill the screen above the sheet and a little under it. */
const SHOWN = 10;

/** A job that now fits comes in from just above, a touch small, after the one above it. */
function rowIn(index: number): EntryExitAnimationFunction {
  return () => {
    "worklet";
    const delay = index * FEED.stagger;
    return {
      initialValues: { opacity: 0, transform: [{ translateY: FEED.from }, { scale: FEED.scale }] },
      animations: {
        opacity: withDelay(delay, withTiming(1, { duration: 180 })),
        transform: [{ translateY: withDelay(delay, withSpring(0, ROW_SPRING)) }, { scale: withDelay(delay, withSpring(1, ROW_SPRING)) }],
      },
    };
  };
}

/** One that no longer fits slides off to the left as it fades. */
const rowOut: EntryExitAnimationFunction = () => {
  "worklet";
  return {
    initialValues: { opacity: 1, transform: [{ translateX: 0 }] },
    animations: {
      opacity: withTiming(0, { duration: FEED.outDuration }),
      transform: [{ translateX: withTiming(FEED.out, { duration: FEED.outDuration }) }],
    },
  };
};

/** The rest move to their new places on the same spring. */
const moved = LinearTransition.springify().mass(ROW_SPRING.mass).stiffness(ROW_SPRING.stiffness).damping(ROW_SPRING.damping);

type Item = { kind: "section"; key: string; title: string; count: number } | { kind: "job"; key: string; job: Job };

export interface PreviewFeedProps {
  /** The jobs fetched while the hook played, widest first; undefined while they load. */
  jobs: readonly Job[] | undefined;
  draft: Profile;
  /** Before the first answer the rows are placeholders, as in the lab. */
  answered: boolean;
  whereAsked: boolean;
  /** Page two is leaving: the feed slides in from the right under it. */
  arriving: boolean;
}

/**
 * Jobs, as it looks, behind the questions (Paper "Onboarding · the build ·
 * Oct 18", 3 to 3c; the Onboarding Motion Lab): the jobs fetched while the
 * hook played, narrowed on the phone as each chip changes, so the feed
 * answers the tap at once. Jobs that now fit come in, ones that don't slide
 * away, and the rest move up or down. Nothing in it is tappable; the real
 * Jobs, from the saved search, takes over when the questions are done.
 */
export function PreviewFeed({ jobs, draft, answered, whereAsked, arriving }: PreviewFeedProps) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const offset = useSharedValue(reduced ? 0 : width * 0.3);
  useEffect(() => {
    if (arriving) offset.value = withSpring(0, spring(LEAVE));
  }, [arriving, offset]);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  const items = useMemo(() => {
    if (!jobs || !answered) return null;
    const sections = feedSections(jobs.filter((job) => fitsAnswers(job, draft, whereAsked)));
    const list: Item[] = [];
    let left = SHOWN;
    for (const section of sections) {
      if (left <= 0 || section.jobs.length === 0) continue;
      list.push({ kind: "section", key: `section-${section.title}`, title: section.title, count: section.jobs.length });
      for (const job of section.jobs.slice(0, left)) list.push({ kind: "job", key: job.id, job });
      left -= Math.min(left, section.jobs.length);
    }
    return list;
  }, [jobs, answered, draft, whereAsked]);

  const stages = STAGES_IN_ORDER.filter((stage) => draft.target_levels.includes(stage));
  let rows = 0;
  return <Animated.View style={[styles.root, { paddingTop: insets.top }, slide]} pointerEvents="none">
    <View style={styles.header}>
      <Text role="largeTitle" accessibilityRole="header">Jobs</Text>
      <View style={styles.row}>
        <View style={styles.flex}><SearchField value="" onChangeText={() => undefined} placeholder="Search these jobs" /></View>
        <IconButton icon="editSearch" label="Your search" onPress={() => undefined} />
      </View>
    </View>
    <ScrollView horizontal scrollEnabled={false} showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.chips}>
      <Chip label="Remote" />
      <Chip label="$100K+" />
      {stages.length > 1 ? stages.map((stage) => <Chip key={stage} label={stageName(stage)} />) : null}
    </ScrollView>
    {items === null ? <RowPlaceholders />
      : items.length === 0 ? <View style={styles.none}><Text role="subhead" tone="ink-3">Nothing fits these yet.</Text></View>
      : items.map((item, index) => {
        const order = item.kind === "job" ? rows++ : rows;
        return <Animated.View key={item.key} entering={reduced ? undefined : rowIn(order)} exiting={reduced ? undefined : rowOut}
          layout={reduced ? undefined : moved}>
          {item.kind === "section"
            ? <SectionHeader title={item.title} count={item.count} first={index === 0} />
            : <JobRow title={plainText(item.job.title)} company={plainText(item.job.company_name)} facts={rowFacts(item.job)} age={rowAge(item.job)}
              unread logo={{ name: item.job.company_name, uri: logoUri(item.job.company_domain) }} />}
        </Animated.View>;
      })}
  </Animated.View>;
}

const styles = StyleSheet.create((theme) => ({
  root: { ...StyleSheet.absoluteFillObject, overflow: "hidden", backgroundColor: theme.ui.color.bg },
  // As Jobs draws its header (JobsScreen) and quick filters (JobsFeed).
  header: { gap: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter, paddingTop: theme.ui.space["3"] },
  row: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["2"] },
  flex: { flex: 1 },
  // A horizontal ScrollView grows and shrinks with its column; this one keeps its own height.
  strip: { flexGrow: 0, flexShrink: 0 },
  chips: { gap: theme.ui.space["2"], paddingHorizontal: theme.ui.size.gutter, paddingTop: theme.ui.space["2"], paddingBottom: theme.ui.space["2"] },
  none: { paddingHorizontal: theme.ui.size.gutter, paddingTop: theme.ui.space["4"] },
}));
