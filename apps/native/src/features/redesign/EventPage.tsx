import { ApiError } from "@pinkslip/core/api";
import { useApi, useEvent, useSetEventReminder } from "@pinkslip/data";
import * as WebBrowser from "expo-web-browser";
import { router, Stack, useIsFocused } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { enableDevicePush } from "../../platform/push";
import { shareEvent } from "../../platform/share";
import {
  Button, DateTile, EmptyState, Floating, Icon, IconButton, JobRow, StampedSlip, Text, Ticket, toast, TopEdgeFade, useTabBarSpace, useTabBarStepsAside,
  type TicketFact,
} from "../../ui";
import { eventStarted, toEventView, type EventView } from "./event-facts";
import { JobIdentity } from "./JobIdentity";
import { BrokenLink, ErrorPage } from "./JobPage";

/**
 * Events (owner, 2026-10-15, Paper "Approved": E1 to E3): a company's
 * events as Coming up's rows (E1), and an event as a page with its own
 * ticket (E2): Remind me and Sign up pinned, Sign up opening their page.
 * Admin adds them from a pasted link (docs/backend-inventory, step 7).
 */
export const EVENT_SAMPLE: EventView[] = [
  {
    id: "info", company: "Stripe", domain: "stripe.com", name: "New grad info session", month: "OCT", day: "22", when: "Wednesday", time: "5:00 PM",
    facts: "Online · 45 min", date: "Wed, Oct 22", hours: "5:00–5:45 PM", where: "Online", signupsClose: "Oct 21", forWhom: "New grads",
    stub: "Hosted by the payments team · via stripe.com", url: "https://stripe.com",
    about: "Engineers from the payments team on what new grads work on in their first year, then questions.",
    points: ["How the payments team plans its work", "What the first 90 days look like"],
  },
  {
    id: "night", company: "Stripe", domain: "stripe.com", name: "Women in payments night", month: "OCT", day: "29", when: "Wednesday", time: "6:30 PM",
    facts: "San Francisco office · In person", date: "Wed, Oct 29", hours: "6:30–8:30 PM", where: "San Francisco office", signupsClose: "Oct 27", forWhom: "Everyone",
    stub: "Hosted by Women at Stripe · via stripe.com", url: "https://stripe.com",
    about: "An evening with engineers and product people from across payments.", points: ["Short talks", "Time to meet the team"],
  },
  {
    id: "review", company: "Stripe", domain: "stripe.com", name: "Résumé review with engineers", month: "NOV", day: "6", when: "Thursday", time: "12:00 PM",
    facts: "Online · Sign-up closes Nov 1", date: "Thu, Nov 6", hours: "12:00–1:00 PM", where: "Online", signupsClose: "Nov 1", forWhom: "New grads",
    stub: "Hosted by university recruiting · via stripe.com", url: "https://stripe.com",
    about: "Twenty minutes one on one with an engineer, on your résumé.", points: ["Bring a PDF", "Questions welcome"],
  },
];

/** E1: a company's events, the date tile in the logo's slot. */
export function EventRows({ events, onOpen }: { events: EventView[]; onOpen: (event: EventView) => void }) {
  return <View>{events.map((event) => <JobRow key={event.id} headline="news" company={event.when} title={event.name} age={event.time}
    facts={event.facts} leading={<DateTile month={event.month} day={event.day} />} onPress={() => onOpen(event)} />)}</View>;
}

function ticketRows(event: EventView): TicketFact[][] {
  const last = [
    event.signupsClose ? { label: "Sign-ups close", value: event.signupsClose } : null,
    event.forWhom ? { label: "For", value: event.forWhom } : null,
  ].filter((fact): fact is TicketFact => Boolean(fact));
  return [
    [{ label: "Date", value: event.date }, { label: "Time", value: event.hours }],
    [{ label: "Where", value: event.where }],
    ...(last.length > 0 ? [last] : []),
  ];
}

export interface EventPageViewProps {
  event: EventView;
  /** Remind me, until the event starts. */
  reminder: { on: boolean; pending?: boolean; onPress: () => void } | null;
  onSignUp: () => void;
  /** Share at the top right (E2); the ⋯ beside it waits until its menu is decided. */
  onShare?: () => void;
}

/** E2: the job page's layout for an event. */
export function EventPageView({ event, reminder, onSignUp, onShare }: EventPageViewProps) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  // /events/… hides the tab bar by its path; the kit's sample asks while it's
  // in front (unfocused, on another tab's stack, it would hide the bar there too).
  useTabBarStepsAside(useIsFocused());
  return <View style={styles.fill}>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView contentContainerStyle={[styles.body, { paddingTop: insets.top + 44 + theme.ui.space["2"], paddingBottom: 62 + insets.bottom + theme.ui.space["6"] }]}>
      <JobIdentity companyName={event.company} companyDomain={event.domain} title={event.name} />
      <View>
        <Ticket rows={ticketRows(event)} stub={event.stub || undefined} />
      </View>
      {event.about || event.points.length > 0 ? <View style={styles.about}>
        <Text weight="medium" accessibilityRole="header">About</Text>
        {event.about ? <Text role="longText">{event.about}</Text> : null}
        {event.points.map((point) => <View key={point} style={styles.point}>
          <Text tone="ink-3">•</Text>
          <Text role="longText" flex>{point}</Text>
        </View>)}
      </View> : null}
    </ScrollView>
    {/* Floating over the page, as the job page's are. */}
    <TopEdgeFade height={insets.top + 44 + 12} />
    <View style={[styles.top, { paddingTop: insets.top }]} pointerEvents="box-none">
      <Floating>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={styles.slot}><Icon name="back" size={20} /></Pressable>
      </Floating>
      {onShare ? <Floating>
        <Pressable onPress={onShare} accessibilityRole="button" accessibilityLabel="Share" style={styles.slot}><Icon name="share" size={20} /></Pressable>
      </Floating> : null}
    </View>
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, theme.ui.space["4"]) }]}>
      {reminder ? <Button icon="notifications" pending={reminder.pending} onPress={reminder.onPress}>{reminder.on ? "Reminding" : "Remind me"}</Button> : null}
      <View style={styles.primary}>
        <Button variant="primary" fullWidth icon="apply" iconAfter onPress={onSignUp}>Sign up</Button>
      </View>
    </View>
  </View>;
}

/** An event's page on the live account. */
export function EventPage({ eventId }: { eventId: string }) {
  const { theme } = useUnistyles();
  const api = useApi();
  const query = useEvent(eventId);
  const remind = useSetEventReminder();
  const event = query.data;
  if (!event) {
    if (!query.isError) return <View style={[styles.fill, styles.center]}>
      <Stack.Screen options={{ headerShown: false }} />
      <ActivityIndicator color={theme.ui.color["ink-3"]} />
    </View>;
    // E2c: a link to an event that was taken down gets the broken link's
    // slip; one that didn't load is plain, with a grey retry.
    const gone = query.error instanceof ApiError && query.error.status === 404;
    return <ErrorPage>{gone
      ? <EmptyState art={<StampedSlip stamp="RETURN TO SENDER" detail="NO SUCH EVENT"><BrokenLink path={`pinkslip.work/events/${eventId.slice(0, 4)}…`} /></StampedSlip>}
        title="This event is gone" message="It may have been called off."
        action={{ label: "Go to Jobs", onPress: () => router.navigate("/") }} />
      : <EmptyState title="This event didn't load" message="Check your connection and try again."
        action={{ label: "Try again", variant: "secondary", onPress: () => void query.refetch() }} />}</ErrorPage>;
  }
  const toggle = () => {
    const on = !event.reminded;
    remind.mutate({ event, on }, {
      onSuccess: () => {
        if (!on) return;
        toast.success("Reminding you the day before");
        // A reminder needs alerts on this iPhone; asking here is the moment it makes sense.
        void enableDevicePush(api).catch(() => undefined);
      },
      onError: () => toast.error(on ? "Couldn't set the reminder. Try again." : "Couldn't turn off the reminder. Try again."),
    });
  };
  return <EventPageView event={toEventView(event)}
    reminder={eventStarted(event) ? null : { on: event.reminded, pending: remind.isPending, onPress: toggle }}
    onSignUp={() => void WebBrowser.openBrowserAsync(event.url, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET, controlsColor: theme.ui.color.accent })}
    onShare={() => void shareEvent({ url: event.url, title: event.title, company_name: event.company_name })} />;
}

/** The kit's event list and page. */
export function SampleEventsPage() {
  const insets = useSafeAreaInsets();
  const tabSpace = useTabBarSpace();
  const [open, setOpen] = useState<EventView | null>(null);
  const [reminding, setReminding] = useState(false);
  if (open) {
    return <EventPageView event={open}
      reminder={{ on: reminding, onPress: () => { setReminding(!reminding); toast.show({ message: "Sample: a reminder the day before" }); } }}
      onSignUp={() => toast.show({ message: "Sample: their sign-up page would open" })} />;
  }
  return <ScrollView contentContainerStyle={{ paddingTop: insets.top, paddingBottom: tabSpace }}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.listTop}><IconButton icon="back" label="Back" onPress={() => router.back()} /></View>
    <View style={styles.listTitle}><Text role="title1">Stripe's events</Text></View>
    <EventRows events={EVENT_SAMPLE} onOpen={setOpen} />
  </ScrollView>;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.ui.color.bg },
  center: { alignItems: "center", justifyContent: "center" },
  body: { paddingHorizontal: theme.ui.size.gutter, gap: theme.ui.space["6"] },
  about: { gap: theme.ui.space["2"] },
  point: { flexDirection: "row", gap: theme.ui.space["2"] },
  top: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: theme.ui.size.gutter },
  slot: { width: theme.ui.size.iconButton, height: theme.ui.size.iconButton, alignItems: "center", justifyContent: "center" },
  bar: {
    position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: theme.ui.space["3"],
    paddingTop: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter, backgroundColor: theme.ui.color.bg,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.ui.color.separator,
  },
  primary: { flex: 1 },
  listTop: { height: 44, justifyContent: "center", paddingHorizontal: theme.ui.size.gutter },
  listTitle: { paddingHorizontal: theme.ui.size.gutter, paddingVertical: theme.ui.space["2"] },
}));
