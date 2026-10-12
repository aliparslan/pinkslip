import { ArrowLeft, BookmarkSimple, DotsThree, Export, EyeSlash, SlidersHorizontal } from "phosphor-react-native";
import { router } from "expo-router";
import { useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  Badge, Button, Chip, IconButton, JobRow, ListGroup, ListItem, PunchCard, SectionHeader, Text, Ticket,
} from "../../ui";
import { SwipeRow, toast } from "../../kit";
import { setRedesignEnabled, useRedesign } from "../redesign/flag";

const facts = [
  [{ label: "Level", value: "New grad" }, { label: "Pay", value: "$145K–$175K" }],
  [{ label: "Location", value: "Remote (US)" }],
  [{ label: "Visa sponsorship", value: "Yes" }, { label: "Experience", value: "0–1 years" }],
];

/** Dev-only: the October 2026 redesign kit (src/ui) in its states. */
export function RedesignGallery() {
  const [chip, setChip] = useState("Remote");
  const [plan, setPlan] = useState("monthly");
  const redesign = useRedesign();
  const [torn, setTorn] = useState(false);
  const [punches, setPunches] = useState(3);
  return <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
    <Section title="Screens" flush>
      <ListGroup footer="Jobs and the job page. Dev builds only.">
        <ListItem title="Redesigned screens" value={redesign ? "On" : "Off"} accessory="chevron" onPress={() => setRedesignEnabled(!redesign)} />
        <ListItem title="Icon sets" accessory="chevron" onPress={() => router.push("/you/kit-icons")} />
      </ListGroup>
    </Section>

    <Section title="Type">
      <Text role="largeTitle">Jobs</Text>
      <Text role="title1">Pro</Text>
      <Text role="title2">This week</Text>
      <Text weight="medium">Software Engineer, New Grad</Text>
      <Text>Body text on ink</Text>
      <Text role="longText">You'll join a product team building the APIs that millions of businesses use to move money, shipping code in your first week.</Text>
      <Text role="subhead" tone="ink-2">Stripe · Remote · $145–175K</Text>
      <Text role="footnote" tone="ink-3">Posted Oct 9 · Rolling deadline · via Greenhouse</Text>
      <Text tone="accent">Needs you</Text>
    </Section>

    <Section title="Buttons">
      <Button variant="primary" fullWidth>Apply</Button>
      <View style={styles.row}>
        <Button icon={BookmarkSimple}>Save</Button>
        <Button variant="plain">Not now</Button>
      </View>
      <View style={styles.row}>
        <Button size="small">Small</Button>
        <Button size="small" pending>Saving</Button>
        <Button size="small" disabled>Disabled</Button>
      </View>
      <View style={styles.row}>
        <IconButton icon={ArrowLeft} label="Back" />
        <IconButton icon={Export} label="Share" />
        <IconButton icon={DotsThree} label="More" />
        <IconButton icon={SlidersHorizontal} label="Edit search" />
        <Badge count={2} />
      </View>
    </Section>

    <Section title="Chips" flush>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {["Remote", "Sponsors visas", "$100K+", "Posted this week"].map((label) =>
          <Chip key={label} label={label} selected={chip === label} onPress={() => setChip(label)} />)}
      </ScrollView>
    </Section>

    <Section title="Job rows" flush>
      <View>
        <SectionHeader title="New today" trailing="12" />
        <SwipeRow id="demo" appearance="capsule"
          leading={{ label: "Save", icon: BookmarkSimple, tone: "accent", run: () => toast.show({ message: "Saved (demo)" }) }}
          trailing={{ label: "Hide", icon: EyeSlash, tone: "bad", run: () => toast.show({ message: "Hidden (demo)" }) }}>
          <JobRow title="Software Engineer, New Grad" company="Stripe" facts="Remote · $145–175K" age="2h" unread logo={{ name: "Stripe", color: "#635BFF" }} />
        </SwipeRow>
        <JobRow title="Product Designer, New Grad" company="Ramp" facts="New York · $130–160K" age="5h" unread logo={{ name: "Ramp", color: "#E8F45C" }} />
        <JobRow title="Software Engineer Intern, Summer 2027" company="Duolingo" facts="Pittsburgh · $52/hr" stage="saved" logo={{ name: "Duolingo", color: "#58CC02" }} />
        <SectionHeader title="Earlier this week" trailing="48" />
        <JobRow title="Software Engineer" company="Notion" facts="New grad · New York · $140–170K" age="3d" logo={{ name: "Notion" }} />
        <JobRow title="Data Analyst I" company="Datadog" facts="New grad · Boston · $95–120K" stage="applied" logo={{ name: "Datadog", color: "#632CA6" }} />
      </View>
    </Section>

    <Section title="Ticket">
      <Ticket rows={facts} stub="Posted Oct 9 · Rolling deadline · via Greenhouse" torn={torn} />
      <Button size="small" onPress={() => setTorn(!torn)}>{torn ? "Reset" : "Tear the stub"}</Button>
      <Text role="footnote" tone="ink-3">After Apply</Text>
      <Ticket rows={facts} torn />
    </Section>

    <View style={styles.grouped}>
      <Section title="Punch card">
        <PunchCard title="This week" note="Resets Monday" allowances={[
          { label: "Applied for you", used: punches, limit: 5 },
          { label: "Emails sent for you", used: 1, limit: 5 },
        ]} />
        <Button size="small" onPress={() => setPunches(punches >= 5 ? 0 : punches + 1)}>{punches >= 5 ? "Reset" : "Punch one"}</Button>
        <PunchCard title="This week" note="Resets Monday" allowances={[
          { label: "Applied for you", used: 10, limit: 15 },
          { label: "Emails sent for you", used: 4, limit: 5 },
        ]} />
        <PunchCard title="Today" note="Resets at midnight" allowances={[{ label: "Applied for you", used: 14, limit: 30 }]} />
        <PunchCard title="This week" note="Resets Monday" allowances={[{ label: "Applied for you", used: 8, limit: 5 }]} />
        <PunchCard title="This week" note="Resets Monday" allowances={[{ label: "Applied for you", used: 38, limit: 50 }]} />
        <PunchCard title="This week" note="No limit on Pro" allowances={[
          { label: "Applied for you", used: 41, limit: null },
          { label: "Emails sent for you", used: 12, limit: null },
        ]} />
      </Section>

      <Section title="Lists" flush>
        <ListGroup footer="Jobs, alerts and the Tracker are always free.">
          <ListItem title="Weekly" value="$9.99" accessory="radio" selected={plan === "weekly"} onPress={() => setPlan("weekly")} />
          <ListItem title="Monthly" detail="$5.77 a week" inline value="$24.99" accessory="radio" selected={plan === "monthly"} onPress={() => setPlan("monthly")} />
          <ListItem title="3 months" detail="$4.61 a week" inline value="$59.99" accessory="radio" selected={plan === "season"} onPress={() => setPlan("season")} />
        </ListGroup>
        <ListGroup header="Notifications">
          <ListItem title="New jobs" value="Right away" accessory="chevron" onPress={() => undefined} />
          <ListItem title="Daily digest" value="8:00 AM" accessory="chevron" onPress={() => undefined} />
          <ListItem title="Quiet hours" accessory="chevron" onPress={() => undefined} />
        </ListGroup>
      </Section>
    </View>
  </ScrollView>;
}

function Section({ title, flush, children }: { title: string; flush?: boolean; children: ReactNode }) {
  return <View style={styles.section}>
    <View style={styles.sectionTitle}><Text role="footnote" weight="medium" tone="ink-3">{title}</Text></View>
    <View style={flush ? styles.flush : styles.body}>{children}</View>
  </View>;
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.ui.color.bg },
  content: { paddingBottom: theme.ui.space["10"] },
  section: { gap: theme.ui.space["3"], paddingTop: theme.ui.space["8"] },
  sectionTitle: { paddingHorizontal: theme.ui.size.gutter },
  body: { gap: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter },
  flush: { gap: theme.ui.space["6"] },
  row: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["2"] },
  chips: { gap: theme.ui.space["2"], paddingHorizontal: theme.ui.size.gutter },
  grouped: { backgroundColor: theme.ui.color["screen-grouped"], marginTop: theme.ui.space["8"], paddingBottom: theme.ui.space["8"] },
}));
