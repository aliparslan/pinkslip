import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  Button, Chip, CompanyLogo, Icon, Radio, SHEET_GROUP_RADIUS, SheetModal, SheetStep, Text, toast, useSheet,
} from "../../../ui";
import { logoUri } from "../../jobs/CompanyLogo";
import { ProSheet } from "../you/PlanPage";
import { YouPage } from "../you/Page";

/**
 * Ask first (owner, 2026-10-14/15, Paper "Apply flow" boards 3 to 6): the
 * morning's strong matches on Today, a review page that sends them, the
 * live bar and queue while it runs, and what Pinkslip sent. Auto-apply's
 * queue isn't on the backend yet, so these run on sample data in the kit.
 */

export interface AskJob {
  id: string;
  company: string;
  domain: string;
  title: string;
  /** "1 to answer" (pink: it needs you) or a quieter note. */
  note?: { text: string; needsYou?: boolean };
  /** Unchecked by default: something Pinkslip can't send for you. */
  skip?: boolean;
}

export const ASK_SAMPLE: AskJob[] = [
  { id: "stripe", company: "Stripe", domain: "stripe.com", title: "Backend Engineer, New Grad" },
  { id: "ramp", company: "Ramp", domain: "ramp.com", title: "Software Engineer, New Grad" },
  { id: "notion", company: "Notion", domain: "notion.so", title: "Software Engineer, Early Career", note: { text: "1 to answer", needsYou: true } },
  { id: "figma", company: "Figma", domain: "figma.com", title: "Backend Engineer, Early Career", note: { text: "Wants a portfolio" }, skip: true },
  { id: "linear", company: "Linear", domain: "linear.app", title: "Software Engineer, New Grad" },
  { id: "duolingo", company: "Duolingo", domain: "duolingo.com", title: "Backend Engineer I" },
  { id: "retool", company: "Retool", domain: "retool.com", title: "Software Engineer, New Grad" },
  { id: "brex", company: "Brex", domain: "brex.com", title: "Software Engineer, New Grad" },
  { id: "airtable", company: "Airtable", domain: "airtable.com", title: "Software Engineer" },
  { id: "plaid", company: "Plaid", domain: "plaid.com", title: "Software Engineer, New Grad" },
];

/** Two logos in the 40 slot, the second 12 down and right with a ring in
 * the card's colour (several companies in one row, never a number). */
export function StackedLogos({ first, second }: { first: { name: string; domain?: string }; second: { name: string; domain?: string } }) {
  return <View style={styles.stack}>
    <View style={styles.stackBack}><CompanyLogo size="stack" name={first.name} uri={logoUri(first.domain)} /></View>
    <View style={styles.stackFront}><CompanyLogo size="stack" name={second.name} uri={logoUri(second.domain)} /></View>
  </View>;
}

/** 3.1, Today's one box: the morning's list, ready to review. */
export function AskFirstCard({ jobs, onReview }: { jobs: AskJob[]; onReview: () => void }) {
  const ready = jobs.filter((job) => !job.skip);
  const names = ready.slice(0, 3).map((job) => job.company);
  const more = ready.length - names.length;
  return <View style={styles.card}>
    <View style={styles.cardTop}>
      <StackedLogos first={{ name: ready[0]?.company ?? "", domain: ready[0]?.domain }} second={{ name: ready[1]?.company ?? "", domain: ready[1]?.domain }} />
      <View style={styles.flex}>
        <Text weight="medium">{`${ready.length} jobs ready to send`}</Text>
        <Text role="subhead" tone="ink-2" lines={1}>{more > 0 ? `${names.join(", ")} and ${more} more` : names.join(", ")}</Text>
      </View>
    </View>
    <Button variant="primary" fullWidth onPress={onReview}>Review and send</Button>
  </View>;
}

/**
 * 3.2, the review is a page: the jobs, checked unless Pinkslip can't send
 * them, labeled only when one needs something; questions several forms ask,
 * once; the resume going out; then Apply to N. On Free (M1) only the
 * week's allowance is checked, with the Pro offer as ink text.
 */
export function ReviewPage({ jobs, free }: { jobs: AskJob[]; free?: { left: number; resets: string } }) {
  const ready = jobs.filter((job) => !job.skip);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set((free ? ready.slice(0, free.left) : ready).map((job) => job.id)));
  const [expanded, setExpanded] = useState(false);
  const [relocate, setRelocate] = useState("Yes");
  const [preview, setPreview] = useState<AskJob | null>(null);
  const [selling, setSelling] = useState(false);
  const shown = expanded ? jobs : jobs.slice(0, 4);
  const toggle = (job: AskJob) => setPicked((current) => {
    const next = new Set(current);
    if (next.has(job.id)) next.delete(job.id);
    else if (!free || next.size < free.left) next.add(job.id);
    else toast.show({ message: `Free sends ${free.left} a week` });
    return next;
  });
  return <YouPage title={`Apply to ${picked.size}`} bar={<Button variant="primary" fullWidth disabled={picked.size === 0}
    onPress={() => { toast.success(`Sample: ${picked.size} would send`); router.back(); }}>{`Apply to ${picked.size}`}</Button>}>
    <View style={styles.group}>
      <View style={styles.listCard}>
        {shown.map((job, index) => <Pressable key={job.id} onPress={() => setPreview(job)} accessibilityRole="button"
          style={({ pressed }) => [styles.job, index > 0 && styles.rule, pressed && styles.pressed]}>
          <View style={styles.smallLogo}><CompanyLogo size="card" name={job.company} uri={logoUri(job.domain)} /></View>
          <View style={styles.flex}>
            <View style={styles.line}>
              <Text role="subhead" weight="medium" lines={1} flex>{job.company}</Text>
              {job.note ? <Text role="subhead" weight={job.note.needsYou ? "medium" : "regular"} tone={job.note.needsYou ? "accent" : "ink-3"}>{job.note.text}</Text> : null}
            </View>
            <Text role="subhead" tone="ink-2" lines={1}>{job.title}</Text>
          </View>
          <Pressable onPress={() => toggle(job)} hitSlop={10} accessibilityRole="checkbox" accessibilityState={{ checked: picked.has(job.id) }}
            accessibilityLabel={`${job.company}, ${job.title}`}>
            <Radio selected={picked.has(job.id)} />
          </Pressable>
        </Pressable>)}
        {!expanded && jobs.length > 4 ? <Pressable onPress={() => setExpanded(true)} accessibilityRole="button" style={[styles.more, styles.rule]}>
          <Text role="subhead" tone="ink-2" flex>{`${jobs.length - 4} more`}</Text>
          <Icon name="disclosure" size={12} tone="ink-4" />
        </Pressable> : null}
      </View>
      {free ? <View style={styles.freeNote}>
        <Text role="footnote" tone="ink-3">{`Free sends ${free.left} a week. Yours reset ${free.resets}.`}</Text>
        <Pressable onPress={() => setSelling(true)} accessibilityRole="button" hitSlop={6}>
          <Text role="footnote" weight="medium">{`Send all ${ready.length} with Pro`}</Text>
        </Pressable>
      </View> : null}
    </View>
    <View style={styles.group}>
      <View style={styles.label}><Text role="footnote" weight="medium" tone="ink-2">3 of these ask</Text></View>
      <View style={styles.questionCard}>
        <Text weight="medium">Open to relocating?</Text>
        <View style={styles.chips}>
          {["Yes", "No", "For the right role"].map((option) => <Chip key={option} label={option} selected={relocate === option} onPress={() => setRelocate(option)} />)}
        </View>
      </View>
    </View>
    <View style={styles.group}>
      <Pressable onPress={() => router.push("/you/resume")} accessibilityRole="button" style={({ pressed }) => [styles.resume, pressed && styles.pressed]}>
        <Text flex>Resume</Text>
        <Text tone="ink-3">Jordan_Lee.pdf</Text>
        <Icon name="disclosure" size={12} tone="ink-4" />
      </Pressable>
    </View>
    <JobPreviewSheet job={preview} onClosed={() => setPreview(null)} />
    <ProSheet open={selling} onClosed={() => setSelling(false)}
      why={`Send the other ${ready.length - (free?.left ?? 0)} strong matches today, and every one after, with no weekly limit.`}
      onBuy={async () => { toast.success("Sample only: nothing was bought."); }} onRestore={async () => undefined} />
  </YouPage>;
}

/** 3.3 and 5.2: one job's preview, what Pinkslip sends, and the question
 * that needs you, with Answer for me. */
function JobPreviewSheet({ job, onClosed }: { job: AskJob | null; onClosed: () => void }) {
  return <SheetModal open={job !== null} onClosed={onClosed}>{job ? <JobPreview job={job} /> : null}</SheetModal>;
}

function JobPreview({ job }: { job: AskJob }) {
  const sheet = useSheet();
  const rows: [string, string][] = [["Resume", "Jordan_Lee.pdf"], ["Authorized to work in the US", "Yes"], ["Needs sponsorship", "No"], ["Open to relocating", "Yes"]];
  return <SheetStep id={`preview-${job.id}`} grabber={false}>
    <View style={styles.previewTop}>
      <View style={styles.smallLogo}><CompanyLogo size="card" name={job.company} uri={logoUri(job.domain)} /></View>
      <View style={styles.flex}>
        <Text weight="medium">{job.company}</Text>
        <Text role="subhead" tone="ink-2" lines={1}>{job.title}</Text>
      </View>
      <Pressable onPress={sheet.close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={6} style={styles.close}>
        <Icon name="close" size={16} tone="ink-2" />
      </Pressable>
    </View>
    {job.note?.needsYou ? <View style={styles.sheetGroup}>
      <Text weight="medium">{`Why do you want to work at ${job.company}?`}</Text>
      <View style={styles.answerBox}><Text tone="ink-3">Your answer</Text></View>
      <View><Button size="small" variant="outline" icon="autoApply" onPress={() => toast.show({ message: "Answer for me comes with Pro." })}>Answer for me</Button></View>
    </View> : null}
    <View style={styles.lead}>
      <View style={styles.label}><Text role="footnote" weight="medium" tone="ink-2">Pinkslip sends</Text></View>
      <View style={styles.sheetList}>
        {rows.map(([title, value], index) => <View key={title} style={[styles.sheetRow, index > 0 && styles.rule]}>
          <Text flex lines={1}>{title}</Text>
          <Text tone="ink-3">{value}</Text>
        </View>)}
        <View style={[styles.sheetRow, styles.rule]}>
          <Text flex>8 more from your profile</Text>
          <Icon name="disclosure" size={12} tone="ink-4" />
        </View>
      </View>
    </View>
    <Button fullWidth onPress={sheet.close}>Done</Button>
  </SheetStep>;
}

const styles = StyleSheet.create((theme) => ({
  flex: { flex: 1, minWidth: 0 },
  stack: { width: 40, height: 40 },
  stackBack: { position: "absolute", left: 0, top: 0 },
  stackFront: { position: "absolute", left: 12, top: 12, borderRadius: 7, borderCurve: "continuous", boxShadow: `0px 0px 0px 2px ${theme.ui.color["bg-grouped"]}` },
  card: { gap: theme.ui.space["4"], marginHorizontal: theme.ui.size.gutter, padding: theme.ui.space["4"], borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-grouped"] },
  cardTop: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  group: { gap: theme.ui.space["2"], paddingHorizontal: theme.ui.size.gutter },
  listCard: { paddingHorizontal: theme.ui.space["4"], borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-grouped"] },
  job: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingVertical: theme.ui.space["3"] },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.ui.color.separator },
  smallLogo: {},
  line: { flexDirection: "row", alignItems: "baseline", gap: theme.ui.space["2"] },
  more: { minHeight: 48, flexDirection: "row", alignItems: "center", paddingLeft: 44 },
  freeNote: { gap: 2, paddingHorizontal: theme.ui.space["4"] },
  label: { paddingHorizontal: theme.ui.space["4"] },
  questionCard: { gap: theme.ui.space["3"], padding: theme.ui.space["4"], borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-grouped"] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.ui.space["2"] },
  resume: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingHorizontal: theme.ui.space["4"], borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-grouped"] },
  pressed: { opacity: 0.6 },
  previewTop: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color.fill },
  sheetGroup: { gap: theme.ui.space["3"], padding: theme.ui.space["4"], borderRadius: SHEET_GROUP_RADIUS, borderCurve: "continuous", backgroundColor: theme.ui.color["sheet-group"] },
  answerBox: { minHeight: 88, padding: theme.ui.space["3"], borderRadius: theme.ui.radius.md, borderWidth: 1.5, borderColor: theme.ui.color.accent },
  lead: { gap: theme.ui.space["1"] },
  sheetList: { paddingHorizontal: theme.ui.space["4"], borderRadius: SHEET_GROUP_RADIUS, borderCurve: "continuous", backgroundColor: theme.ui.color["sheet-group"] },
  sheetRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
}));
