import { BookmarkSimple, EyeSlash } from "phosphor-react-native";
import { router } from "expo-router";
import { useRef, useState, type ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  ApplyButton, Badge, Button, Chip, GlyphMenu, IconButton, JobRow, ListGroup, ListItem, PunchCard, SectionHeader, SheetModal, SheetStep, Text, Ticket,
  useSheet, useTabBarSpace, type ApplyState,
} from "../../ui";
import { SwipeRow, toast } from "../../kit";
import { ApplicationBrowser, type ApplicationRequest } from "../apply/ApplicationBrowser";
import { replayOnboarding } from "../onboarding/launch";
import { DidYouApply } from "../redesign/ApplySheets";
import { LIVE_FORM_URL, SAMPLE_FORM_URL } from "../apply/sample-form";
import { setRedesignEnabled, useRedesign } from "../redesign/flag";
import { ReportJobSheet } from "../redesign/ReportJobSheet";
import { RELEASES, WhatsNewSheet, type Release } from "../redesign/whats-new";
import { setPaperTexture, usePaperTexture, type PaperTexture } from "../../ui/Grain";

const facts = [
  [{ label: "Level", value: "New grad" }, { label: "Pay", value: "$145K–$175K" }],
  [{ label: "Location", value: "Remote (US)" }],
  [{ label: "Visa sponsorship", value: "Yes" }, { label: "Experience", value: "0–1 years" }],
];

/** Dev-only: the October 2026 redesign kit (src/ui) in its states. */
export function RedesignGallery() {
  const [chip, setChip] = useState("Remote");
  const tabSpace = useTabBarSpace();
  const [plan, setPlan] = useState("monthly");
  const redesign = useRedesign();
  const [torn, setTorn] = useState(false);
  const [punches, setPunches] = useState(3);
  const texture = usePaperTexture();
  const [reporting, setReporting] = useState(false);
  const [release, setRelease] = useState<Release | null>(null);
  const [browsing, setBrowsing] = useState<ApplicationRequest | null>(null);
  // Apply's sheet, then the browser, then "Did you apply?", in the job page's order.
  const [preparing, setPreparing] = useState(false);
  const opening = useRef(false);
  const [asking, setAsking] = useState(false);
  const askAfter = useRef(false);
  const sampleRequest: ApplicationRequest = { jobId: "sample", url: SAMPLE_FORM_URL, autoSubmit: false, company: "Stripe", sample: true, local: true };
  const sampleApplied = () => toast.show({ message: "Applied to Stripe. It's in Tracker.", icon: "done" });
  return <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { paddingBottom: tabSpace }]}>
    <Section title="Screens" flush>
      <ListGroup footer="Dev builds and the owner's phone build only.">
        <ListItem title="Redesigned screens" value={redesign ? "On" : "Off"} accessory="chevron" onPress={() => setRedesignEnabled(!redesign)} />
        <ListItem title="Onboarding, from the start" accessory="chevron" onPress={() => { replayOnboarding(); router.navigate("/"); }} />
        <ListItem title="Onboarding, saving to your search" accessory="chevron" onPress={() => { replayOnboarding(true); router.navigate("/"); }} />
        <ListItem title="Icon sets" accessory="chevron" onPress={() => router.push("/you/kit-icons")} />
        <ListItem title="Sheet transitions" accessory="chevron" onPress={() => router.push("/you/kit-sheets")} />
        <ListItem title="Today with sample data" accessory="chevron" onPress={() => router.push("/you/kit-today")} />
        <ListItem title="Today, Ask first's list" accessory="chevron" onPress={() => router.push({ pathname: "/you/kit-today", params: { flow: "ask" } })} />
        <ListItem title="Today, applying for you" accessory="chevron" onPress={() => router.push({ pathname: "/you/kit-today", params: { flow: "sending" } })} />
        <ListItem title="Review, on Free with 3 left" accessory="chevron" onPress={() => router.push({ pathname: "/you/kit-review", params: { free: "1" } })} />
        <ListItem title="What Pinkslip sent" accessory="chevron" onPress={() => router.push("/you/kit-sent")} />
        <ListItem title="In-app browser, a sample form" accessory="chevron" onPress={() => setBrowsing(sampleRequest)} />
        <ListItem title="In-app browser, a live Greenhouse form" accessory="chevron"
          onPress={() => setBrowsing({ jobId: "sample", url: LIVE_FORM_URL, autoSubmit: false, company: "Stripe", sample: true })} />
        <ListItem title="Apply's sheet, then the browser" accessory="chevron" onPress={() => setPreparing(true)} />
        <ListItem title="Job page, the stub tears off" accessory="chevron" onPress={() => router.push("/you/kit-job")} />
        <ListItem title="Events, and an event's page" accessory="chevron" onPress={() => router.push("/you/kit-events")} />
        <ListItem title="Auto-apply settings" accessory="chevron" onPress={() => router.push("/you/kit-auto-apply")} />
        <ListItem title="Auto-apply, paused" accessory="chevron" onPress={() => router.push({ pathname: "/you/kit-auto-apply", params: { paused: "1" } })} />
        <ListItem title="People: Dana, before writing" accessory="chevron" onPress={() => router.push({ pathname: "/(tabs)/(today)/people/[threadId]", params: { threadId: "sample-dana" } })} />
        <ListItem title="Tracker with sample data" accessory="chevron" onPress={() => router.push("/you/kit-tracker")} />
        <ListItem title="Application page with sample data" accessory="chevron" onPress={() => router.push({ pathname: "/(tabs)/(library)/applications/[applicationId]", params: { applicationId: "sample-interview" } })} />
        <ListItem title="Application Pinkslip sent, confirmed" accessory="chevron" onPress={() => router.push({ pathname: "/(tabs)/(library)/applications/[applicationId]", params: { applicationId: "sample-confirmed" } })} />
        <ListItem title="Application Pinkslip sent, waiting" accessory="chevron" onPress={() => router.push({ pathname: "/(tabs)/(library)/applications/[applicationId]", params: { applicationId: "sample-sent" } })} />
        <ListItem title="Email tracking, on" accessory="chevron" onPress={() => router.push({ pathname: "/you/email", params: { sample: "on" } })} />
        <ListItem title="Email tracking, waiting" accessory="chevron" onPress={() => router.push({ pathname: "/you/email", params: { sample: "waiting" } })} />
        <ListItem title="Email tracking, set up from off" accessory="chevron" onPress={() => router.push({ pathname: "/you/email", params: { sample: "off" } })} />
        <ListItem title="Job emails with sample data" accessory="chevron" onPress={() => router.push({ pathname: "/you/email-history", params: { sample: "on" } })} />
        <ListItem title="You with sample data" accessory="chevron" onPress={() => router.push({ pathname: "/you", params: { sample: "on" } })} />
        <ListItem title="Alerts, every option" accessory="chevron" onPress={() => router.push({ pathname: "/you/alerts", params: { sample: "on" } })} />
        <ListItem title="Plan, Free" accessory="chevron" onPress={() => router.push({ pathname: "/you/plan", params: { sample: "free" } })} />
        <ListItem title="Plan, Pro" accessory="chevron" onPress={() => router.push({ pathname: "/you/plan", params: { sample: "pro" } })} />
        <ListItem title="Resume with sample data" accessory="chevron" onPress={() => router.push({ pathname: "/you/resume", params: { sample: "on" } })} />
        <ListItem title="Answers with sample data" accessory="chevron" onPress={() => router.push({ pathname: "/you/answers", params: { sample: "on" } })} />
        <ListItem title="Report a job" accessory="chevron" onPress={() => setReporting(true)} />
        <ListItem title="What's new, after an update" accessory="chevron" onPress={() => setRelease(RELEASES[0] ?? null)} />
        <ListItem title="Admin with sample data" accessory="chevron" onPress={() => router.push({ pathname: "/you/admin", params: { sample: "on" } })} />
      </ListGroup>
      {/* The job page's ⋯ (Paper "Menus · Oct 16" M2) without opening a real job. */}
      <View style={styles.body}>
        <GlyphMenu top={[{ id: "save", title: "Save", glyph: "save", onSelect: () => toast.show({ message: "Sample: saved" }) }, { id: "hide", title: "Hide", glyph: "hide", onSelect: () => toast.show({ message: "Sample: hidden" }) }]}
          items={[
            { id: "apply", title: "I applied", glyph: "applied", onSelect: () => undefined },
            { id: "email", title: "Email recruiter", glyph: "email", onSelect: () => undefined },
            { id: "tailor", title: "Tailor resume", glyph: "tailor", onSelect: () => undefined },
            { id: "company", title: "Hide Stripe", glyph: "company", onSelect: () => undefined },
            { id: "report", title: "Report listing", glyph: "report", onSelect: () => undefined },
          ]}
          last={[{ id: "block", title: "Block for everyone", glyph: "block", destructive: true, onSelect: () => undefined }]}>
          <View style={styles.menuTrigger}><Text>The job page's ⋯ menu</Text></View>
        </GlyphMenu>
      </View>
      <ReportJobSheet jobId="sample" sample open={reporting} onClosed={() => setReporting(false)} />
      <WhatsNewSheet release={release} onClosed={() => setRelease(null)} />
      {/* Paper "2 · The in-app browser and fill bar", on a local form. */}
      <ApplicationBrowser request={browsing} onSubmitted={sampleApplied} onConfirmApplied={sampleApplied}
        onClose={(result) => { setBrowsing(null); askAfter.current = result === "closed"; }}
        onDismissed={() => { if (askAfter.current) { askAfter.current = false; setAsking(true); } }} />
      <SheetModal open={preparing} onClosed={() => setPreparing(false)}
        onGone={() => { if (opening.current) { opening.current = false; setBrowsing(sampleRequest); } }}>
        <SamplePrep onOpen={() => { opening.current = true; }} />
      </SheetModal>
      <SheetModal open={asking} onClosed={() => setAsking(false)}><DidYouApply onYes={sampleApplied} /></SheetModal>
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
        <Button icon="save">Save</Button>
        <Button variant="plain">Not now</Button>
      </View>
      <View style={styles.row}>
        <Button size="small">Small</Button>
        <Button size="small" variant="outline">Follow</Button>
        <Button size="small" pending>Saving</Button>
        <Button size="small" disabled>Disabled</Button>
      </View>
      <View style={styles.row}>
        <IconButton icon="back" label="Back" />
        <IconButton icon="share" label="Share" />
        <IconButton icon="more" label="More" />
        <IconButton icon="editSearch" label="Edit search" />
        <Badge count={2} />
      </View>
    </Section>

    <Section title="The Apply button, every state">
      {/* Paper "1 · The Apply button, every state". Tap the first to step
          through them and watch it morph; the rest stand still. */}
      <ApplyStates />
    </Section>

    <Section title="Toast">
      {/* Samples only: nothing here changes your data. */}
      <View style={styles.row}>
        <Button size="small" onPress={() => toast.show({ message: "Job hidden", icon: "hide", action: { label: "Undo", run: () => { toast.success("Back in Jobs (sample)"); } } })}>Undo</Button>
        <Button size="small" onPress={() => toast.success("Test notification sent")}>Done</Button>
        <Button size="small" onPress={() => toast.error("Couldn't refresh jobs", { action: { label: "Try again", run: () => undefined } })}>Couldn't</Button>
      </View>
      <View style={styles.row}>
        <Button size="small" onPress={() => {
          toast.loading("Checking Ramp's careers page…", { dedupeKey: "sample-check" });
          setTimeout(() => toast.success("Ramp fixed · 4 new jobs", { dedupeKey: "sample-check" }), 2500);
        }}>Working</Button>
        <Button size="small" onPress={() => {
          toast.show({ message: "Ramp hidden", duration: 20_000, icon: "hide", action: { label: "Undo", run: () => undefined } });
          setTimeout(() => toast.show({ message: "Removed from Saved", duration: 20_000, icon: "saved", action: { label: "Undo", run: () => undefined } }), 350);
          setTimeout(() => toast.show({ message: "Notion hidden", duration: 20_000, icon: "hide", action: { label: "Undo", run: () => undefined } }), 700);
        }}>Three at once</Button>
        {/* The stack's samples stay 20 seconds, long enough to spread and swipe them. */}
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
        <SectionHeader title="New today" count="12" />
        <SwipeRow id="demo" appearance="capsule"
          leading={{ label: "Save", icon: BookmarkSimple, symbol: "save", tone: "accent", run: () => toast.show({ message: "Saved (demo)" }) }}
          trailing={{ label: "Hide", icon: EyeSlash, symbol: "hide", tone: "bad", run: () => toast.show({ message: "Hidden (demo)" }) }}>
          <JobRow title="Software Engineer, New Grad" company="Stripe" facts="Remote · $145–175K" age="2h" unread logo={{ name: "Stripe", color: "#635BFF" }} />
        </SwipeRow>
        <JobRow title="Product Designer, New Grad" company="Ramp" facts="New York · $130–160K" age="5h" unread logo={{ name: "Ramp", color: "#E8F45C" }} />
        <JobRow title="Software Engineer Intern, Summer 2027" company="Duolingo" facts="Pittsburgh · $52/hr" stage="saved" logo={{ name: "Duolingo", color: "#58CC02" }} />
        <SectionHeader title="Earlier this week" count="48" />
        <JobRow title="Software Engineer" company="Notion" facts="New grad · New York · $140–170K" age="3d" logo={{ name: "Notion" }} />
        <JobRow title="Data Analyst I" company="Datadog" facts="New grad · Boston · $95–120K" stage="applied" logo={{ name: "Datadog", color: "#632CA6" }} />
      </View>
    </Section>

    <Section title="Paper" flush>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {(["stock", "cotton", "recycled", "noise"] as PaperTexture[]).map((name) =>
          <Chip key={name} label={name} selected={texture === name} onPress={() => setPaperTexture(name)} />)}
      </ScrollView>
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

/** Apply's sheet on a sample: just its Open application. */
function SamplePrep({ onOpen }: { onOpen: () => void }) {
  const { close } = useSheet();
  return <SheetStep id="prep">
    <View style={styles.body}>
      <Text role="title2">Apply at Stripe</Text>
      <Button variant="primary" fullWidth icon="apply" iconAfter onPress={() => { close(); onOpen(); }}>Open application</Button>
    </View>
  </SheetStep>;
}

const APPLY_STATES: ApplyState[] = [
  { kind: "apply" },
  { kind: "applyForMe" },
  { kind: "queued", ahead: 2 },
  { kind: "applying", filled: 11, of: 17 },
  { kind: "needsYou", questions: 2 },
  { kind: "sent", company: "Stripe" },
  { kind: "applied", date: "Oct 14" },
  { kind: "stage", stage: "interview", label: "Interviewing" },
];

function ApplyStates() {
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(false);
  const myself = () => toast.show({ message: "Sample: the posting would open" });
  return <>
    <ApplyButton state={APPLY_STATES[step]!} saved={saved} onSave={() => setSaved(!saved)}
      onPress={() => setStep((step + 1) % APPLY_STATES.length)} onApplyMyself={myself} />
    <Text role="footnote" tone="ink-3">Tap it to step through the states.</Text>
    {APPLY_STATES.slice(1).map((state) => <ApplyButton key={state.kind} state={state} saved={false} onSave={() => undefined} onApplyMyself={myself} />)}
  </>;
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
  menuTrigger: { minHeight: 44, justifyContent: "center", paddingHorizontal: theme.ui.space["4"], borderRadius: theme.ui.radius.md, backgroundColor: theme.ui.color["bg-grouped"] },
  row: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["2"] },
  chips: { gap: theme.ui.space["2"], paddingHorizontal: theme.ui.size.gutter },
  grouped: { backgroundColor: theme.ui.color["screen-grouped"], marginTop: theme.ui.space["8"], paddingBottom: theme.ui.space["8"] },
}));
