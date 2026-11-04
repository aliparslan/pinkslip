import type { SendNeed, WaitingSends } from "@pinkslip/core/api";
import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import {
  Button, Choice, Choices, CodeBoxes, CompanyLogo, faces, Icon, LETTER_CODE_LENGTH, SearchField, SHEET_GROUP_RADIUS, SheetBack, SheetStep, Text, useSheetTravel,
  useSheet, useUiFontsLoaded,
} from "../../../ui";
import { logoUri } from "../../jobs/CompanyLogo";
import { StackedLogos } from "../apply-flow/AskFirst";
import { needControl } from "../send-facts";
import { companyNames } from "../today-facts";

export interface SendJob {
  company: string;
  domain?: string | null;
  title: string;
}

/** A send's sheets open with the job they're for (Paper "5.2 · Answering"):
 * its logo, company and title, and the 36 close button. No grab bar. */
function SendHeader({ job }: { job: SendJob }) {
  const { close } = useSheet();
  return <View style={styles.header}>
    <CompanyLogo name={job.company} uri={logoUri(job.domain ?? null)} />
    <View style={styles.headerText}>
      <Text weight="medium" lines={1}>{job.company}</Text>
      <Text role="subhead" tone="ink-2" lines={1}>{job.title}</Text>
    </View>
    <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={6} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
      <Icon name="close" size={16} tone="ink-2" />
    </Pressable>
  </View>;
}

export type NeedAnswers = Record<string, string | string[]>;

/**
 * Needs you (Paper "5.2 · Answering" and "Send screens · Oct 24", S4): one
 * question a step, "2 of 3" above it, Back and Next at the bottom; the last
 * step's button sends. Answers are kept for every later form, so a question
 * is asked once.
 */
export function NeedsSheet({ job, needs, dryRun, pending, onSend }: {
  job: SendJob;
  needs: SendNeed[];
  /** A Check first run is checked again rather than sent. */
  dryRun: boolean;
  pending: boolean;
  onSend: (answers: NeedAnswers) => void;
}) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<NeedAnswers>({});
  // Next slides the questions left, Back right, whichever question it is.
  const travel = useSheetTravel();
  const go = (by: 1 | -1) => { travel(by); setStep(step + by); };
  const need = needs[step];
  if (!need?.ref) return null;
  const ref = need.ref;
  const value = answers[ref];
  const answered = Array.isArray(value) ? value.length > 0 : Boolean(value?.trim());
  const last = step === needs.length - 1;
  const set = (next: string | string[]) => setAnswers((current) => ({ ...current, [ref]: next }));
  return <SheetStep id={`need-${step}`} inner={step > 0} grabber={false}>
    <SendHeader job={job} />
    <View style={styles.question}>
      {needs.length > 1 ? <Text role="footnote" weight="medium" tone="ink-3">{`${step + 1} of ${needs.length}`}</Text> : null}
      <Text weight="medium">{need.label}</Text>
    </View>
    <NeedInput key={ref} need={need} value={value} onChange={set} />
    <View style={styles.actions}>
      {step > 0 ? <SheetBack onPress={() => go(-1)} /> : null}
      <View style={styles.flex}>
        <Button variant="primary" fullWidth disabled={!answered} pending={last && pending}
          onPress={() => (last ? onSend(answers) : go(1))}>
          {!last ? "Next" : dryRun ? "Check again" : `Send to ${job.company}`}
        </Button>
      </View>
    </View>
  </SheetStep>;
}

/** Several sends' one sheet opens with all of them (W5): the two logos, how
 * many, and who. One send opens with its job, as its own sheet does. */
function WaitingHeader({ waiting }: { waiting: WaitingSends }) {
  const { close } = useSheet();
  const [first, second] = waiting.sends;
  if (!first) return null;
  if (!second) return <SendHeader job={first} />;
  return <View style={styles.header}>
    <StackedLogos first={{ name: first.company, domain: first.domain }} second={{ name: second.company, domain: second.domain }} ring="sheet" />
    <View style={styles.headerText}>
      <Text weight="medium" lines={1}>{`${waiting.sends.length} applications`}</Text>
      <Text role="subhead" tone="ink-2" lines={1}>{companyNames(waiting.sends.map((send) => send.company))}</Text>
    </View>
    <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={6} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
      <Icon name="close" size={16} tone="ink-2" />
    </Pressable>
  </View>;
}

/**
 * Every send that stopped on questions, in one sheet (Paper "Stopped sends ·
 * Nov 4", W5 to W7): each question once, "1 of 6 · Glean and Databricks"
 * above it, kept as it's answered so closing loses nothing; it opens on the
 * first one still unanswered, and the last step sends them all.
 */
export function WaitingSheet({ waiting, pending, onKeep, onSendAll }: {
  waiting: WaitingSends;
  pending: boolean;
  /** An answer, as Next is pressed. */
  onKeep: (answers: NeedAnswers) => void;
  /** The last answer, then Send all. */
  onSendAll: (answers: NeedAnswers) => void;
}) {
  const questions = waiting.questions;
  const [step, setStep] = useState(() => Math.max(0, questions.findIndex((question) => question.answer === null)));
  const [answers, setAnswers] = useState<NeedAnswers>(() =>
    Object.fromEntries(questions.flatMap((question) => (question.answer === null ? [] : [[question.id, question.answer]]))));
  const travel = useSheetTravel();
  const go = (by: 1 | -1) => { travel(by); setStep(step + by); };
  const question = questions[step];
  if (!question) return null;
  const value = answers[question.id];
  const answered = Array.isArray(value) ? value.length > 0 : Boolean(value?.trim());
  const last = step === questions.length - 1;
  const several = waiting.sends.length > 1;
  const need: SendNeed = { ref: question.id, label: question.label, kind: question.kind, options: question.options };
  const set = (next: string | string[]) => setAnswers((current) => ({ ...current, [question.id]: next }));
  const line = [questions.length > 1 ? `${step + 1} of ${questions.length}` : null, several ? companyNames(question.companies) : null].filter(Boolean).join(" · ");
  return <SheetStep id={`waiting-${step}`} inner={step > 0} grabber={false}>
    <WaitingHeader waiting={waiting} />
    <View style={styles.question}>
      {line ? <Text role="footnote" weight="medium" tone="ink-3">{line}</Text> : null}
      <Text weight="medium">{question.label}</Text>
    </View>
    <NeedInput key={question.id} need={need} value={value} onChange={set} />
    <View style={styles.actions}>
      {step > 0 ? <SheetBack onPress={() => go(-1)} /> : null}
      <View style={styles.flex}>
        <Button variant="primary" fullWidth disabled={!answered} pending={last && pending}
          onPress={() => {
            const given = { [question.id]: value! };
            if (last) return onSendAll(given);
            onKeep(given);
            go(1);
          }}>
          {!last ? "Next" : several ? `Send all ${waiting.sends.length}` : `Send to ${waiting.sends[0]!.company}`}
        </Button>
      </View>
    </View>
  </SheetStep>;
}

/** The answer's control: a field, the kit's Choice rows, or a search over a
 * long list (a school) that shows the closest few. */
function NeedInput({ need, value, onChange }: { need: SendNeed; value: string | string[] | undefined; onChange: (value: string | string[]) => void }) {
  const { theme } = useUnistyles();
  const fonts = useUiFontsLoaded();
  const [query, setQuery] = useState("");
  const control = needControl(need);
  if (control.kind === "text") {
    return <View style={styles.field}>
      <TextInput value={typeof value === "string" ? value : ""} onChangeText={onChange} autoFocus multiline={control.multiline}
        maxLength={2000} textAlignVertical="top" accessibilityLabel={need.label} placeholderTextColor={theme.ui.color["ink-3"]} selectionColor={theme.ui.color.accent}
        style={[styles.input, control.multiline && styles.inputLong, { fontFamily: fonts ? faces.text : undefined }]} />
    </View>;
  }
  const picked = Array.isArray(value) ? value : value ? [value] : [];
  const toggle = (option: string) => {
    if (!control.multiple) return onChange(option);
    onChange(picked.includes(option) ? picked.filter((item) => item !== option) : [...picked, option]);
  };
  const needle = query.trim().toLowerCase();
  const shown = control.search
    ? [...picked.filter((option) => !needle || option.toLowerCase().includes(needle)),
      ...control.options.filter((option) => !picked.includes(option) && (!needle || option.toLowerCase().includes(needle)))].slice(0, 6)
    : control.options;
  return <View style={styles.pick}>
    {control.search ? <SearchField value={query} onChangeText={setQuery} placeholder="Search" /> : null}
    <ScrollView style={styles.options} contentContainerStyle={styles.optionsBody} keyboardShouldPersistTaps="handled">
      <Choices>
        {shown.map((option) => <Choice key={option} plain title={option} multiple={control.multiple}
          selected={picked.includes(option)} onPress={() => toggle(option)} />)}
      </Choices>
    </ScrollView>
  </View>;
}

/**
 * Greenhouse's emailed code (Paper "Send screens · Oct 24", S3): sign-in's
 * code boxes, eight of them, which iPhone fills from Mail. With forwarding
 * on, the code usually comes in by itself and the sheet isn't needed.
 */
export function CodeSheet({ job, email, pending, failed, onSend }: {
  job: SendJob;
  /** Where Greenhouse sent it: the email on the form. */
  email: string | null;
  pending: boolean;
  /** The last code didn't go in. */
  failed: boolean;
  onSend: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const full = code.length === LETTER_CODE_LENGTH;
  return <SheetStep id="code" grabber={false}>
    <SendHeader job={job} />
    <View style={styles.question}>
      <Text weight="medium">Enter the code Greenhouse emailed you</Text>
      <Text role="subhead" tone="ink-2">{`It went to ${email ?? "your email"}. ${job.company}'s form is held open for it.`}</Text>
    </View>
    <CodeBoxes value={code} onChangeText={setCode} letters invalid={failed && !pending} />
    {failed && !pending ? <Text role="footnote" tone="bad">That code didn't go in. Check it and try again.</Text> : null}
    <Button variant="primary" fullWidth disabled={!full} pending={pending} onPress={() => onSend(code)}>{`Send to ${job.company}`}</Button>
  </SheetStep>;
}

const styles = StyleSheet.create((theme) => ({
  flex: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"] },
  headerText: { flex: 1, minWidth: 0 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: theme.ui.color.fill },
  pressed: { opacity: 0.6 },
  question: { gap: theme.ui.space["1"] },
  actions: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["2"] },
  field: {
    paddingHorizontal: theme.ui.space["4"],
    borderRadius: SHEET_GROUP_RADIUS,
    borderCurve: "continuous",
    backgroundColor: theme.ui.color["sheet-group"],
  },
  input: {
    minHeight: 50,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: theme.ui.type.body.size,
    lineHeight: theme.ui.type.body.line,
    color: theme.ui.color.ink,
  },
  inputLong: { minHeight: 112 },
  pick: { gap: theme.ui.space["3"] },
  // A long list scrolls inside the sheet; a short one fits.
  options: { flexGrow: 0, maxHeight: 340 },
  optionsBody: { flexGrow: 0 },
}));
