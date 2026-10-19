import type { ApplicationAnswerValue, SavedApplicationAnswer } from "@pinkslip/core/api";
import { formatResumeDate, monthInputValue } from "@pinkslip/core/resume-fields";
import { effectiveAuthorization, isCommonQuestionKey, PRONOUN_OPTIONS, staleAuthorizationKeys } from "@pinkslip/domain/application-answers";
import type { WorkAuthorization } from "@pinkslip/domain/search-profile";
import { useAnswers, useDeleteAnswer, usePreferences, useResumeProfile, useSession, useSetAnswer, useUpdatePreferences } from "@pinkslip/data";
import { useState, type ReactNode } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Menu, type MenuItem } from "../../../kit";
import {
  Button, Choice, Choices, EmptyState, faces, Icon, MonthRow, SHEET_GROUP_RADIUS, SheetHeader, SheetModal, SheetStep, Text, toast, useSheet, useUiFontsLoaded,
} from "../../../ui";
import { ComingSoon, YouPage } from "./Page";

/**
 * Answers (owner, 2026-10-14, Paper A7, A4 and A5): what forms ask often and
 * you haven't answered, what you have, and what you answered on one
 * company's form. Simple answers open the iPhone's menu from the row, as
 * Appearance does; dates open the wheel in place; salary and written answers
 * open a sheet. Rows carry no detail lines (owner, 2026-10-15).
 */

export interface AnswersActions {
  save: (key: string, value: ApplicationAnswerValue, label?: string) => Promise<void>;
  clear: (key: string) => Promise<void>;
  setSponsorship: (choice: WorkAuthorization) => Promise<void>;
}

export interface AnswersViewProps {
  answers: SavedApplicationAnswer[];
  sponsorship?: WorkAuthorization;
  /** Your graduation from the resume, until it's answered here. */
  resumeGraduation?: string;
  actions: AnswersActions;
}

const OFFICE: Record<string, string> = { "0": "Remote only", "1": "Up to 1 day", "2": "Up to 2 days", "3": "Up to 3 days", "4": "Up to 4 days", "5": "Any" };
const STARTS = ["Immediately", "In two weeks", "In a month", "After graduation"];
const SPONSORSHIP: Record<WorkAuthorization, string> = { authorized: "Not needed", sponsorship: "Needed", not_sure: "Not sure" };

function shown(value: ApplicationAnswerValue): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === "yes") return "Yes";
  if (value === "no") return "No";
  if (value === "decline") return "Prefer not to say";
  return value;
}

export function AnswersView({ answers, sponsorship, resumeGraduation, actions }: AnswersViewProps) {
  const [graduationOpen, setGraduationOpen] = useState(false);
  const [salary, setSalary] = useState(false);
  const [written, setWritten] = useState<SavedApplicationAnswer | null>(null);
  const text = (key: string) => { const value = answers.find((answer) => answer.key === key)?.value; return typeof value === "string" ? value : ""; };
  const failed = () => toast.error("Couldn't save that answer. Try again.");
  const save = (key: string, value: ApplicationAnswerValue) => void actions.save(key, value).catch(failed);
  const clear = (key: string) => void actions.clear(key).catch(failed);

  const graduation = monthInputValue(text("graduation") || resumeGraduation || "");
  const pronouns = text("pronouns");
  const rows: { key: string; answered: boolean; node: ReactNode }[] = [
    {
      key: "graduation", answered: Boolean(graduation),
      node: <MonthRow label="Graduation" value={graduation} open={graduationOpen} onToggle={() => setGraduationOpen((open) => !open)}
        onChange={(month) => save("graduation", formatResumeDate(month))} />,
    },
    {
      key: "start_date", answered: Boolean(text("start_date")),
      node: <MenuRow label="Earliest start" value={text("start_date") === "Immediately" ? "Now" : text("start_date")}
        items={[...STARTS.map((start) => ({ id: start, title: start === "Immediately" ? "Now" : start, checked: text("start_date") === start, onSelect: () => save("start_date", start) })),
          { id: "ask", title: "Ask me each time", onSelect: () => clear("start_date") }]} />,
    },
    {
      key: "relocation", answered: Boolean(text("relocation")),
      node: <MenuRow label="Open to relocation" value={text("relocation") ? shown(text("relocation")) : ""}
        items={[{ id: "yes", title: "Yes", checked: text("relocation") === "yes", onSelect: () => save("relocation", "yes") },
          { id: "no", title: "No", checked: text("relocation") === "no", onSelect: () => save("relocation", "no") },
          { id: "ask", title: "Ask me each time", onSelect: () => clear("relocation") }]} />,
    },
    {
      key: "office_days", answered: Boolean(text("office_days")),
      node: <MenuRow label="Days in an office" value={OFFICE[text("office_days")] ?? ""}
        items={Object.entries(OFFICE).map(([days, title]) => ({ id: days, title: days === "5" ? "Any of these" : days === "0" ? title : `Hybrid, ${title.toLowerCase()}`, checked: text("office_days") === days, onSelect: () => save("office_days", days) }))} />,
    },
    {
      key: "sponsorship", answered: sponsorship !== undefined,
      node: <MenuRow label="Visa sponsorship" value={sponsorship ? SPONSORSHIP[sponsorship] : ""}
        items={(Object.keys(SPONSORSHIP) as WorkAuthorization[]).map((choice) => ({ id: choice, title: SPONSORSHIP[choice], checked: sponsorship === choice, onSelect: () => void actions.setSponsorship(choice).catch(failed) }))} />,
    },
    {
      key: "salary", answered: Boolean(text("salary")),
      node: <LinkRow label="Salary expectation" value={text("salary")} onPress={() => setSalary(true)} />,
    },
    {
      key: "pronouns", answered: Boolean(pronouns),
      node: <MenuRow label="Pronouns" value={pronouns ? shown(pronouns) : ""}
        items={[...PRONOUN_OPTIONS.map((option) => ({ id: option, title: option, checked: pronouns === option, onSelect: () => save("pronouns", option) })),
          { id: "other", title: "Other…", onSelect: () => Alert.prompt("Your pronouns", undefined, (value) => { if (value?.trim()) save("pronouns", value.trim()); }) },
          { id: "decline", title: "Prefer not to say", checked: pronouns === "decline", onSelect: () => save("pronouns", "decline") }]} />,
    },
  ];
  const open = rows.filter((row) => !row.answered);
  const done = rows.filter((row) => row.answered);
  const fromForms = answers.filter((answer) => !isCommonQuestionKey(answer.key) && answer.key !== "sponsorship" && answer.key !== "work_authorization");

  return <YouPage title="Answers">
    {open.length > 0 ? <Group label="Asked often, not answered" count={open.length}>{open.map((row) => <View key={row.key}>{row.node}</View>)}</Group> : null}
    {done.length > 0 ? <Group label="Answered" count={done.length}>{done.map((row) => <View key={row.key}>{row.node}</View>)}</Group> : null}
    {fromForms.length > 0 ? <Group label="From your applications" count={fromForms.length}>
      {fromForms.map((answer) => <LinkRow key={answer.key} label={answer.label || "A question"} onPress={() => setWritten(answer)} />)}
    </Group> : null}
    <SalarySheet open={salary} value={text("salary")} onClosed={() => setSalary(false)}
      onSave={(value) => save("salary", value)} onLeave={() => clear("salary")} />
    <WrittenSheet answer={written} onClosed={() => setWritten(null)}
      onSave={(answer, value) => save(answer.key, value)} onForget={(answer) => clear(answer.key)} />
  </YouPage>;
}

function Group({ label, count, children }: { label: string; count: number; children: ReactNode[] }) {
  return <View style={styles.group}>
    <View style={styles.groupLabel}>
      <Text role="footnote" weight="medium" tone="ink-2">{label}</Text>
      <Text role="footnote" tone="ink-3">{String(count)}</Text>
    </View>
    <View style={styles.card}>
      {children.map((child, index) => <View key={index} style={index > 0 && styles.rule}>{child}</View>)}
    </View>
  </View>;
}

/** A row whose value opens the iPhone's menu in place. */
function MenuRow({ label, value, items }: { label: string; value: string; items: MenuItem[] }) {
  return <View style={styles.row}>
    <Text flex>{label}</Text>
    <Menu title="" items={items}>
      <View style={styles.menuValue} accessibilityRole="button" accessibilityLabel={`${label}, ${value || "not answered"}`}>
        {value ? <Text tone="ink-3" lines={1}>{value}</Text> : null}
        <Icon name="pick" size={12} tone="ink-4" />
      </View>
    </Menu>
  </View>;
}

function LinkRow({ label, value, onPress }: { label: string; value?: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
    <Text flex lines={1}>{label}</Text>
    {value ? <Text tone="ink-3" lines={1}>{value}</Text> : null}
    <Icon name="disclosure" size={12} tone="ink-4" />
  </Pressable>;
}

/** A4: the amount, a year or an hour, then Save or leave it to you each time. */
function SalarySheet({ open, value, onClosed, onSave, onLeave }: { open: boolean; value: string; onClosed: () => void; onSave: (value: string) => void; onLeave: () => void }) {
  return <SheetModal open={open} onClosed={onClosed}>{open ? <SalaryStep value={value} onSave={onSave} onLeave={onLeave} /> : null}</SheetModal>;
}

function SalaryStep({ value, onSave, onLeave }: { value: string; onSave: (value: string) => void; onLeave: () => void }) {
  const { theme } = useUnistyles();
  const fonts = useUiFontsLoaded();
  const sheet = useSheet();
  const hourly = /an hour$/i.test(value);
  const [amount, setAmount] = useState(value.replace(/\s*(a year|an hour)$/i, ""));
  const [per, setPer] = useState<"a year" | "an hour">(hourly ? "an hour" : "a year");
  return <SheetStep id="salary">
    <SheetHeader title="Salary expectation" />
    <View style={styles.sheetField}>
      <TextInput value={amount} onChangeText={setAmount} keyboardType="numbers-and-punctuation" placeholder="$110,000" autoFocus
        placeholderTextColor={theme.ui.color["ink-3"]} selectionColor={theme.ui.color.accent} accessibilityLabel="Amount"
        style={[styles.sheetInput, { fontFamily: fonts ? faces.text : undefined }]} />
      <Menu title="" items={(["a year", "an hour"] as const).map((option) => ({ id: option, title: option === "a year" ? "A year" : "An hour", checked: per === option, onSelect: () => setPer(option) }))}>
        <View style={styles.menuValue}><Text tone="ink-3">{per}</Text><Icon name="pick" size={12} tone="ink-4" /></View>
      </Menu>
    </View>
    <View style={styles.answers}>
      <Button variant="primary" fullWidth disabled={!amount.trim()} onPress={() => { onSave(`${amount.trim()} ${per}`); sheet.close(); }}>Save</Button>
      <Button variant="text" fullWidth onPress={() => { onLeave(); sheet.close(); }}>Leave it to me each time</Button>
    </View>
  </SheetStep>;
}

/** A5: a question one company asked, with its own wording, your answer, and
 * when you saved it. */
function WrittenSheet({ answer, onClosed, onSave, onForget }: {
  answer: SavedApplicationAnswer | null;
  onClosed: () => void;
  onSave: (answer: SavedApplicationAnswer, value: ApplicationAnswerValue) => void;
  onForget: (answer: SavedApplicationAnswer) => void;
}) {
  return <SheetModal open={answer !== null} onClosed={onClosed}>
    {answer ? <WrittenStep answer={answer} onSave={onSave} onForget={onForget} /> : null}
  </SheetModal>;
}

function WrittenStep({ answer, onSave, onForget }: { answer: SavedApplicationAnswer; onSave: WrittenSheetSave; onForget: (answer: SavedApplicationAnswer) => void }) {
  const { theme } = useUnistyles();
  const fonts = useUiFontsLoaded();
  const sheet = useSheet();
  const yesNo = answer.value === "yes" || answer.value === "no";
  const [draft, setDraft] = useState(Array.isArray(answer.value) ? answer.value.join(", ") : answer.value === "decline" ? "" : answer.value);
  const saved = new Date(answer.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const forget = () => { onForget(answer); sheet.close(); };
  return <SheetStep id={`answer-${answer.key}`}>
    <SheetHeader title={answer.label || "A question"} />
    {yesNo ? <Choices>
      {(["yes", "no"] as const).map((choice) => <Choice key={choice} plain title={choice === "yes" ? "Yes" : "No"} selected={draft === choice}
        onPress={() => { onSave(answer, choice); sheet.close(); }} />)}
    </Choices> : <View style={styles.answerBox}>
      <TextInput value={draft} onChangeText={setDraft} multiline scrollEnabled={false} textAlignVertical="top" accessibilityLabel="Your answer"
        selectionColor={theme.ui.color.accent} style={[styles.answerInput, { fontFamily: fonts ? faces.text : undefined }]} />
    </View>}
    <View style={styles.note}><Text role="footnote" tone="ink-3">{`Saved ${saved}`}</Text></View>
    <View style={styles.answers}>
      {yesNo ? null : <Button variant="primary" fullWidth disabled={!draft.trim()} onPress={() => {
        onSave(answer, Array.isArray(answer.value) ? draft.split(",").map((item) => item.trim()).filter(Boolean) : draft.trim());
        sheet.close();
      }}>Save</Button>}
      <Pressable onPress={forget} accessibilityRole="button" style={({ pressed }) => [styles.forget, pressed && styles.pressed]}>
        <Text weight="medium" tone="bad">Forget this answer</Text>
      </Pressable>
    </View>
  </SheetStep>;
}

type WrittenSheetSave = (answer: SavedApplicationAnswer, value: ApplicationAnswerValue) => void;

/** Answers on the live account. Until auto-apply is on for the account, the
 * page says what's coming. */
export function AnswersPage() {
  const session = useSession();
  if (!session.data?.me?.features?.auto_apply_enabled) {
    return <YouPage title="Answers" scroll={false}><ComingSoon title="Answers are coming" message="Answers you give once will fill in every application." /></YouPage>;
  }
  return <LiveAnswers />;
}

function LiveAnswers() {
  const answers = useAnswers();
  const preferences = usePreferences();
  const resume = useResumeProfile();
  const setAnswer = useSetAnswer();
  const deleteAnswer = useDeleteAnswer();
  const updatePreferences = useUpdatePreferences();
  if (!answers.data) {
    return <YouPage title="Answers">
      {answers.isError ? <EmptyState title="Answers didn't load" message="They're safe. Check your connection and try again."
        action={{ label: "Try again", variant: "secondary", onPress: () => void answers.refetch() }} /> : null}
    </YouPage>;
  }
  const profile = preferences.data?.search_profile;
  const bank = answers.data;
  return <AnswersView answers={bank} sponsorship={profile ? effectiveAuthorization(profile.work_authorization, bank) : undefined}
    resumeGraduation={resume.data?.data.education[0]?.endDate.trim()} actions={{
      save: async (key, value, label) => { await setAnswer.mutateAsync({ key, value, label }); },
      clear: async (key) => { await deleteAnswer.mutateAsync(key); },
      setSponsorship: async (choice) => {
        if (profile && profile.work_authorization !== choice) await updatePreferences.mutateAsync({ search_profile: { ...profile, work_authorization: choice } });
        for (const key of staleAuthorizationKeys(choice, bank)) await deleteAnswer.mutateAsync(key);
      },
    }} />;
}

const styles = StyleSheet.create((theme) => ({
  group: { gap: theme.ui.space["1"], paddingHorizontal: theme.ui.size.gutter },
  groupLabel: { flexDirection: "row", alignItems: "baseline", gap: 6, paddingHorizontal: theme.ui.space["4"] },
  card: { paddingHorizontal: theme.ui.space["4"], borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-grouped"] },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.ui.color.separator },
  row: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  menuValue: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  pressed: { opacity: 0.6 },
  answers: { gap: theme.ui.space["2"] },
  sheetField: {
    minHeight: 56, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingHorizontal: theme.ui.space["4"],
    borderRadius: SHEET_GROUP_RADIUS, borderCurve: "continuous", backgroundColor: theme.ui.color["sheet-group"],
  },
  sheetInput: { flex: 1, padding: 0, fontSize: theme.ui.type.body.size, lineHeight: theme.ui.type.body.line, color: theme.ui.color.ink },
  answerBox: { padding: theme.ui.space["4"], borderRadius: SHEET_GROUP_RADIUS, borderCurve: "continuous", backgroundColor: theme.ui.color["sheet-group"] },
  answerInput: { minHeight: 88, padding: 0, fontSize: theme.ui.type.body.size, lineHeight: theme.ui.type.longText.line, color: theme.ui.color.ink },
  note: { marginTop: -theme.ui.space["3"], paddingHorizontal: theme.ui.space["4"] },
  forget: { minHeight: 50, alignItems: "center", justifyContent: "center" },
}));
