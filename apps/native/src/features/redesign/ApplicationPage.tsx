import { DatePicker, Host } from "@expo/ui/swift-ui";
import { datePickerStyle, tint } from "@expo/ui/swift-ui/modifiers";
import { ApiError, type ApplicationDetail, type ApplicationStage } from "@pinkslip/core/api";
import { parseJobDescription } from "@pinkslip/core/job-description";
import { useApplication, useRemoveApplication, useUndoInboundEmail, useUpdateApplication } from "@pinkslip/data";
import { router, Stack, useSegments } from "expo-router";
import { useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { toast } from "../../kit";
import { haptics } from "../../platform/haptics";
import {
  Button, Choice, Choices, DateTile, EmptyDateTile, EmptyState, SHEET_GROUP_RADIUS, SheetHeader, SheetModal, SheetStep, StageMark, Stub, Text, useSheet,
  type StubStamp,
} from "../../ui";
import { useDetailJob, type DetailJob, type JobMenuItem } from "../job-detail/useJobPage";
import {
  addStageDateLabels, asksForDate, daysSinceApplied, nextRowFacts, stageDateHasTime, stageDatePrompts, stageDateTitles, stageDateToSend,
  stageDateValue, stubStamps, type Stamp,
} from "./application-facts";
import { Description } from "./Description";
import { BAR, TOP_BAR, TopBar } from "./JobPage";
import { JobIdentity } from "./JobIdentity";
import { ticketStub } from "./job-facts";
import { MOVE_TO } from "./tracker-facts";

/** What the page asks of whoever holds the application: the server, or a sample's own state. */
export interface ApplicationActions {
  setStage: (stage: ApplicationStage) => Promise<void>;
  setDate: (stageDate: string | null) => Promise<void>;
  undoEmail: (emailId: string) => Promise<void>;
  remove: () => Promise<void>;
}

/**
 * An application's page (Paper "Application page · ideas · Oct 13", idea C):
 * the job page with the ticket swapped for your stub, the part that tore off
 * when you applied, stamped with each step. Under it the date that goes with
 * the stage, then the posting. One button changes the stage; a stage with a
 * date asks for it next. Tracker rows past Saved open it.
 */
export function ApplicationPage({ applicationId }: { applicationId: string }) {
  const { theme } = useUnistyles();
  const query = useApplication(applicationId);
  const update = useUpdateApplication();
  const removal = useRemoveApplication();
  const undo = useUndoInboundEmail();
  const application = query.data;
  if (!application) {
    const gone = query.error instanceof ApiError && query.error.status === 404;
    return <View style={styles.center}>
      <Stack.Screen options={{ title: "" }} />
      {query.isPending ? <ActivityIndicator color={theme.ui.color["ink-3"]} />
        : <EmptyState title={gone ? "This isn't in Tracker anymore" : "This application didn't load"}
          message={gone ? "It may have been removed." : "Check your connection and try again."}
          action={gone ? undefined : { label: "Try again", onPress: () => void query.refetch() }} />}
    </View>;
  }
  const failed = (message: string) => (error: unknown) => {
    toast.error(message);
    throw error;
  };
  const actions: ApplicationActions = {
    setStage: async (stage) => {
      await update.mutateAsync({ id: application.id, stage }).catch(failed("Couldn't change the stage. Try again."));
      haptics.success();
    },
    setDate: async (stageDate) => {
      await update.mutateAsync({ id: application.id, stage_date: stageDate }).catch(failed("Couldn't save the date. Try again."));
    },
    undoEmail: async (emailId) => {
      await undo.mutateAsync({ emailId, applicationId: application.id }).catch(failed("Couldn't undo it. Try again."));
      const after = await query.refetch();
      if (!after.data) router.back();
    },
    remove: async () => {
      await removal.mutateAsync({ id: application.id, jobId: application.job_id }).catch(failed("Couldn't remove it. Try again."));
      router.back();
    },
  };
  return application.job_id
    ? <WithJob application={application} jobId={application.job_id} actions={actions} />
    : <ApplicationView application={application} actions={actions} />;
}

function WithJob({ application, jobId, actions }: { application: ApplicationDetail; jobId: string; actions: ApplicationActions }) {
  const { theme } = useUnistyles();
  const { job, full, failed, pendingDescription } = useDetailJob(jobId);
  const blocks = useMemo(() => job ? parseJobDescription(job.description, { title: job.title, companyName: job.company_name }) : [],
    [job]);
  const about = !full && !failed || pendingDescription ? <ActivityIndicator style={styles.spinner} color={theme.ui.color["ink-3"]} />
    : blocks.length > 0 ? <Description blocks={blocks} />
    : <Text role="subhead" tone="ink-2">The full posting didn't come through. The original may still have it.</Text>;
  return <ApplicationView application={application} job={job} about={about} actions={actions} />;
}

type SheetStart = "stages" | "date";

export function ApplicationView({ application, job, about, actions }: {
  application: ApplicationDetail;
  job?: DetailJob;
  /** The posting's description, under "About the role". */
  about?: ReactNode;
  actions: ApplicationActions;
}) {
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const tab = (useSegments() as readonly string[])[1] ?? "(library)";
  const [sheet, setSheet] = useState<SheetStart | null>(null);
  const stamps = stubStamps(application);
  const latest = stamps.at(-1);
  const waiting = application.stage === "applied" && stamps.length === 1 && !application.stage_date
    ? daysSinceApplied(application.applied_at) : null;

  const confirmUndo = (stamp: Stamp & { email: NonNullable<Stamp["email"]> }) => {
    const before = stamps.at(-2);
    const from = stamp.email.subject ? `From “${stamp.email.subject}”.` : "From an email you forwarded.";
    Alert.alert(before ? `Back to ${label(before.stage)}?` : "Remove it from Tracker?", from, [
      { text: "Cancel", style: "cancel" },
      // Undoing a step isn't destructive; removing the application is.
      { text: before ? "Undo" : "Remove", style: before ? "default" : "destructive", onPress: () => void actions.undoEmail(stamp.email.id).catch(() => undefined) },
    ]);
  };
  const confirmRemove = () => Alert.alert("Remove it from Tracker?", "Its stamps and dates go with it.", [
    { text: "Cancel", style: "cancel" },
    { text: "Remove", style: "destructive", onPress: () => void actions.remove().catch(() => undefined) },
  ]);
  const share = () => void Share.share({ message: `${application.company_name}: ${application.title}`, url: application.url || undefined });
  const menu: JobMenuItem[] = [
    application.stage === "applied" && !application.stage_date ? { label: "Add a hear-back date", run: () => setSheet("date") } : null,
    application.job_id ? { label: "Open the posting", run: () => router.push({ pathname: `/(tabs)/${tab}/jobs/[jobId]` as "/(tabs)/(library)/jobs/[jobId]", params: { jobId: application.job_id! } }) } : null,
    { label: "Remove from Tracker", destructive: true, run: confirmRemove },
  ].filter((item): item is JobMenuItem => item !== null);

  const stubStampsShown: StubStamp[] = stamps.map((stamp, index) => ({
    key: `${stamp.stage}-${index}`, label: stamp.label, detail: stamp.email ? `${stamp.date} · EMAIL` : stamp.date,
  }));

  return <View style={styles.fill}>
    <Stack.Screen options={{ headerShown: false }} />
    <ScrollView style={styles.fill}
      contentContainerStyle={[styles.body, { paddingTop: insets.top + TOP_BAR + theme.ui.space["2"], paddingBottom: BAR + insets.bottom + theme.ui.space["6"] }]}>
      <JobIdentity companyName={job?.company_name ?? application.company_name} companyDomain={job?.company_domain ?? application.job?.company_domain}
        companyId={job?.company_id} title={job?.title ?? application.title} closed={Boolean(job?.closed_at ?? application.job?.closed_at)} />
      <View style={styles.stub}>
        <Stub stamps={stubStampsShown} foot={job ? ticketStub(job) : undefined}
          aside={waiting ? <View>
            <Text role="subhead" weight="medium" tone="ink-2">{waiting}</Text>
            <Text role="footnote" tone="ink-3">no reply yet</Text>
          </View> : undefined}
          action={latest?.email ? { label: "Not right?", onPress: () => confirmUndo(latest as Stamp & { email: NonNullable<Stamp["email"]> }) } : undefined} />
      </View>
      <NextSection application={application} onOpen={() => setSheet("date")} />
      {about ? <View style={styles.about}>
        <Text weight="medium" accessibilityRole="header">About the role</Text>
        {about}
      </View> : null}
    </ScrollView>
    <TopBar onShare={share} menu={menu} />
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, theme.ui.space["4"]) }]}>
      <Button variant="secondary" fullWidth onPress={() => setSheet("stages")}>Change stage</Button>
    </View>
    <SheetModal open={sheet !== null} onClosed={() => setSheet(null)}>
      {sheet ? <StageSheet application={application} start={sheet} actions={actions} /> : null}
    </SheetModal>
  </View>;
}

const label = (stage: ApplicationStage) => MOVE_TO.find((option) => option.stage === stage)?.label ?? stage;

/** The date that goes with the stage, or a quiet row to add one. */
function NextSection({ application, onOpen }: { application: ApplicationDetail; onOpen: () => void }) {
  const { stage, stage_date: stageDate } = application;
  const addLabel = addStageDateLabels[stage];
  if (!stageDate && !addLabel) return null;
  const facts = stageDate ? nextRowFacts(stageDate) : null;
  const title = stageDateTitles[stage] ?? "";
  return <View style={styles.next}>
    <Text role="footnote" weight="medium" tone="ink-2" accessibilityRole="header">Next</Text>
    <Pressable onPress={onOpen} accessibilityRole="button"
      accessibilityLabel={facts ? `${title}, ${facts.when}${facts.time ? ` at ${facts.time}` : ""}. Change` : addLabel}
      style={({ pressed }) => [styles.nextRow, pressed && styles.pressed]}>
      {facts ? <DateTile month={facts.month} day={facts.day} /> : <EmptyDateTile />}
      {facts
        ? <View style={styles.nextText}>
          <View style={styles.nextLine}>
            <Text role="subhead" tone="ink-2" flex>{facts.when}</Text>
            {facts.time ? <Text role="subhead" tone="ink-3">{facts.time}</Text> : null}
          </View>
          <Text weight="medium">{title}</Text>
        </View>
        : <Text tone="ink-2" flex>{addLabel}</Text>}
    </Pressable>
  </View>;
}

/** Endings sit in their own group, last, so its corners follow the sheet's. */
const MOVING = MOVE_TO.slice(0, 5);
const ENDINGS = MOVE_TO.slice(5);

/**
 * Change stage (Paper "C · 1"): tapping a stage moves the application there.
 * A stage with a date of its own slides on to ask for it (Paper "C · 2"),
 * which is also where the Next row and "Add a hear-back date" open.
 */
function StageSheet({ application, start, actions }: { application: ApplicationDetail; start: SheetStart; actions: ApplicationActions }) {
  const sheet = useSheet();
  const [step, setStep] = useState<SheetStart>(start);
  const [moved, setMoved] = useState(false);
  const [stage, setStage] = useState(application.stage);

  const pick = (next: ApplicationStage) => {
    if (next !== application.stage) {
      void actions.setStage(next).catch(() => undefined);
      setMoved(true);
    }
    if (asksForDate(next)) {
      setStage(next);
      setStep("date");
    } else {
      sheet.close();
    }
  };

  if (step === "stages") {
    const row = (option: (typeof MOVE_TO)[number]) => <Choice key={option.stage} title={option.label}
      leading={<StageMark stage={option.stage} size={20} />} selected={application.stage === option.stage} onPress={() => pick(option.stage)} />;
    return <SheetStep id="stages">
      <SheetHeader title="Change stage" />
      <Choices>{MOVING.map(row)}</Choices>
      <Choices last>{ENDINGS.map(row)}</Choices>
    </SheetStep>;
  }

  // A new stage starts without a date; the one it had belongs to the old stage.
  const existing = !moved && stage === application.stage ? application.stage_date : null;
  return <DateStep stage={stage} existing={existing} inner={start === "stages"}
    onSave={(value) => {
      void actions.setDate(value).catch(() => undefined);
      haptics.success();
      sheet.close();
    }}
    onRemove={existing ? () => {
      void actions.setDate(null).catch(() => undefined);
      sheet.close();
    } : undefined}
    onSkip={sheet.close} />;
}

function defaultDate(stage: ApplicationStage): Date {
  const date = new Date();
  date.setDate(date.getDate() + (stage === "applied" ? 7 : 1));
  date.setHours(stage === "interview" ? 10 : 12, 0, 0, 0);
  return date;
}

/** "When's the interview?": the calendar, a time for an interview, then Save,
 * with Skip under it (or Remove date when it already had one). */
function DateStep({ stage, existing, inner, onSave, onRemove, onSkip }: {
  stage: ApplicationStage;
  existing: string | null;
  inner: boolean;
  onSave: (value: string) => void;
  onRemove?: () => void;
  onSkip: () => void;
}) {
  const { theme } = useUnistyles();
  const withTime = stageDateHasTime(stage);
  const [date, setDate] = useState(() => {
    const value = existing ? stageDateValue(existing) : defaultDate(stage);
    if (withTime && existing && /^\d{4}-\d{2}-\d{2}$/.test(existing)) value.setHours(10, 0, 0, 0);
    return value;
  });
  // The calendar and the clock each change their part of one date.
  const setDay = (day: Date) => setDate((current) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), current.getHours(), current.getMinutes()));
  const setTime = (time: Date) => setDate((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate(), time.getHours(), time.getMinutes()));
  const accent = theme.ui.color["accent-fill"];
  return <SheetStep id="date" inner={inner}>
    <SheetHeader title={stageDatePrompts[stage] ?? "When?"} />
    <View style={styles.calendar}>
      <Host matchContents={{ vertical: true }} style={styles.host}>
        <DatePicker selection={date} displayedComponents={["date"]} onDateChange={setDay}
          modifiers={[datePickerStyle("graphical"), tint(accent)]} />
      </Host>
    </View>
    {withTime ? <View style={styles.time}>
      <Text flex>Time</Text>
      <Host matchContents>
        <DatePicker selection={date} displayedComponents={["hourAndMinute"]} onDateChange={setTime}
          modifiers={[datePickerStyle("compact"), tint(accent)]} />
      </Host>
    </View> : null}
    <View style={styles.answers}>
      <Button variant="primary" fullWidth onPress={() => onSave(stageDateToSend(date, withTime))}>Save</Button>
      {onRemove
        ? <Button variant="text" fullWidth onPress={onRemove}>Remove date</Button>
        : <Button variant="text" fullWidth onPress={onSkip}>Skip</Button>}
    </View>
  </SheetStep>;
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1, backgroundColor: theme.ui.color.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: theme.ui.space["8"], backgroundColor: theme.ui.color.bg },
  body: { paddingHorizontal: theme.ui.size.gutter },
  stub: { marginTop: theme.ui.space["6"] },
  next: { gap: theme.ui.space["2"], marginTop: theme.ui.space["6"] },
  nextRow: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  nextText: { flex: 1 },
  nextLine: { flexDirection: "row", alignItems: "baseline", gap: theme.ui.space["2"] },
  pressed: { opacity: 0.6 },
  about: { gap: theme.ui.space["2"], marginTop: theme.ui.space["6"] },
  spinner: { alignSelf: "flex-start", paddingVertical: theme.ui.space["4"] },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: theme.ui.space["3"],
    paddingHorizontal: theme.ui.size.gutter,
    backgroundColor: theme.ui.color.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.ui.color.separator,
  },
  calendar: { borderRadius: SHEET_GROUP_RADIUS, borderCurve: "continuous", backgroundColor: theme.ui.color.fill, paddingHorizontal: theme.ui.space["2"] },
  host: { alignSelf: "stretch" },
  time: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 50,
    paddingLeft: theme.ui.space["4"],
    paddingRight: theme.ui.space["2"],
    borderRadius: SHEET_GROUP_RADIUS,
    borderCurve: "continuous",
    backgroundColor: theme.ui.color.fill,
  },
  answers: { gap: theme.ui.space["2"] },
}));
