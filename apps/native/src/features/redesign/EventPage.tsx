import { router, Stack } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Button, DateTile, IconButton, JobRow, Text, Ticket, toast, useTabBarStepsAside } from "../../ui";
import { JobIdentity } from "./JobIdentity";

/**
 * Events (owner, 2026-10-15, Paper "Events · Oct 15"): a company's events
 * as Coming up's rows (E1), and an event as a page with its own ticket
 * (E2): Remind me and Sign up pinned, Sign up opening their page. They ship
 * as coming soon, so the kit shows them on a sample.
 */
export interface CompanyEvent {
  id: string;
  company: string;
  domain: string;
  name: string;
  month: string;
  day: string;
  weekday: string;
  time: string;
  where: string;
  length: string;
  date: string;
  hours: string;
  signupsClose: string;
  forWhom: string;
  host: string;
  about: string;
  points: string[];
}

export const EVENT_SAMPLE: CompanyEvent[] = [
  {
    id: "info", company: "Stripe", domain: "stripe.com", name: "New grad info session", month: "OCT", day: "22", weekday: "Wednesday", time: "5:00 PM",
    where: "Online", length: "45 min", date: "Wed, Oct 22", hours: "5:00–5:45 PM", signupsClose: "Oct 21", forWhom: "New grads", host: "Hosted by the payments team · via stripe.com",
    about: "Engineers from the payments team on what new grads work on in their first year, then questions.",
    points: ["How the payments team plans its work", "What the first 90 days look like"],
  },
  {
    id: "night", company: "Stripe", domain: "stripe.com", name: "Women in payments night", month: "OCT", day: "29", weekday: "Wednesday", time: "6:30 PM",
    where: "San Francisco office", length: "In person", date: "Wed, Oct 29", hours: "6:30–8:30 PM", signupsClose: "Oct 27", forWhom: "Everyone", host: "Hosted by Women at Stripe · via stripe.com",
    about: "An evening with engineers and product people from across payments.", points: ["Short talks", "Time to meet the team"],
  },
  {
    id: "review", company: "Stripe", domain: "stripe.com", name: "Résumé review with engineers", month: "NOV", day: "6", weekday: "Thursday", time: "12:00 PM",
    where: "Online", length: "Sign-up closes Nov 1", date: "Thu, Nov 6", hours: "12:00–1:00 PM", signupsClose: "Nov 1", forWhom: "New grads", host: "Hosted by university recruiting · via stripe.com",
    about: "Twenty minutes one on one with an engineer, on your résumé.", points: ["Bring a PDF", "Questions welcome"],
  },
];

/** E1: a company's events, the date tile in the logo's slot. */
export function EventRows({ events, onOpen }: { events: CompanyEvent[]; onOpen: (event: CompanyEvent) => void }) {
  return <View>{events.map((event) => <JobRow key={event.id} headline="news" company={event.weekday} title={event.name} age={event.time}
    facts={`${event.where} · ${event.length}`} leading={<DateTile month={event.month} day={event.day} />} onPress={() => onOpen(event)} />)}</View>;
}

/** E2: the job page's layout for an event. */
export function EventPageView({ event }: { event: CompanyEvent }) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const [reminding, setReminding] = useState(false);
  useTabBarStepsAside(true);
  return <View style={styles.fill}>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + 44 + theme.ui.space["2"], paddingBottom: 62 + insets.bottom + theme.ui.space["6"] }]}>
      <JobIdentity companyName={event.company} companyDomain={event.domain} title={event.name} />
      <View>
        <Ticket rows={[
          [{ label: "Date", value: event.date }, { label: "Time", value: event.hours }],
          [{ label: "Where", value: event.where }],
          [{ label: "Sign-ups close", value: event.signupsClose }, { label: "For", value: event.forWhom }],
        ]} stub={event.host} />
      </View>
      <View style={styles.about}>
        <Text weight="medium" accessibilityRole="header">About</Text>
        <Text role="longText">{event.about}</Text>
        {event.points.map((point) => <View key={point} style={styles.point}>
          <Text tone="ink-3">•</Text>
          <Text role="longText" flex>{point}</Text>
        </View>)}
      </View>
    </ScrollView>
    <View style={[styles.top, { paddingTop: insets.top }]} pointerEvents="box-none">
      <IconButton icon="back" label="Back" onPress={() => router.back()} />
    </View>
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, theme.ui.space["4"]) }]}>
      <Button icon="notifications" onPress={() => { setReminding(true); toast.show({ message: "Sample: a reminder the day before" }); }}>{reminding ? "Reminding" : "Remind me"}</Button>
      <View style={styles.primary}>
        <Button variant="primary" fullWidth icon="apply" onPress={() => toast.show({ message: "Sample: their sign-up page would open" })}>Sign up</Button>
      </View>
    </View>
  </View>;
}

/** The kit's event list and page. */
export function SampleEventsPage() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState<CompanyEvent | null>(null);
  if (open) return <EventPageView event={open} />;
  return <ScrollView contentContainerStyle={{ paddingTop: insets.top }}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.listTop}><IconButton icon="back" label="Back" onPress={() => router.back()} /></View>
    <View style={styles.listTitle}><Text role="title1">Stripe's events</Text></View>
    <EventRows events={EVENT_SAMPLE} onOpen={setOpen} />
  </ScrollView>;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.ui.color.bg },
  body: { paddingHorizontal: theme.ui.size.gutter, gap: theme.ui.space["6"] },
  about: { gap: theme.ui.space["2"] },
  point: { flexDirection: "row", gap: theme.ui.space["2"] },
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: theme.ui.size.gutter },
  bar: {
    position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: theme.ui.space["3"],
    paddingTop: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter, backgroundColor: theme.ui.color.bg,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.ui.color.separator,
  },
  primary: { flex: 1 },
  listTop: { height: 44, justifyContent: "center", paddingHorizontal: theme.ui.size.gutter },
  listTitle: { paddingHorizontal: theme.ui.size.gutter, paddingVertical: theme.ui.space["2"] },
}));
