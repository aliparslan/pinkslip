import type { ApplicationAnswerValue, SavedApplicationAnswer } from "@pinkslip/core/api";
import { formatResumeDate, monthInputValue } from "@pinkslip/core/resume-fields";
import { effectiveAuthorization, isCommonQuestionKey, PRONOUN_OPTIONS, staleAuthorizationKeys } from "@pinkslip/domain/application-answers";
import type { WorkAuthorization } from "@pinkslip/domain/search-profile";
import { useAnswers, useDeleteAnswer, usePreferences, useResumeProfile, useSession, useSetAnswer, useUpdatePreferences } from "@pinkslip/data";
import { ClipboardText, Trash, WarningCircle } from "phosphor-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button, EmptyState, Field, IconButton, Input, Screen, Spinner, Stack, Surface, Text, Textarea, toast, ToggleGroup, UNDO_TOAST_DURATION } from "../../kit";

const HYBRID_DAYS = ["1", "2", "3", "4"] as const;
const MONTH = /^\d{4}-\d{2}$/;

function display(value: ApplicationAnswerValue): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === "yes") return "Yes";
  if (value === "no") return "No";
  if (value === "decline") return "Prefer not to say";
  return value;
}

function samePronoun(value: string, option: string): boolean {
  const words = (input: string) => input.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  return value !== "" && (words(value) === words(option) || words(value).startsWith(`${words(option)} `));
}

/** The answer bank (`AnswersSection.svelte`), behind auto-apply: common
 * questions as chips (tap again to un-answer), sponsorship as the job
 * preferences' work authorization, remembered answers edited in place and
 * deleted with Undo. Dates are typed (YYYY-MM-DD, YYYY-MM). */
export function Answers() {
  const session = useSession();
  if (!session.data?.me?.features?.auto_apply_enabled) {
    return <Screen><EmptyState icon={ClipboardText} title="Coming soon" message="Answers you give once will fill in every application." /></Screen>;
  }
  return <AnswerBank />;
}

function AnswerBank() {
  const answers = useAnswers();
  const preferences = usePreferences();
  const resume = useResumeProfile();
  const setAnswer = useSetAnswer();
  const deleteAnswer = useDeleteAnswer();
  const updatePreferences = useUpdatePreferences();
  const [hybridOpen, setHybridOpen] = useState(false);
  const [pronounOther, setPronounOther] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  if (answers.isPending) return <Screen><Spinner label="Loading answers" /></Screen>;
  if (answers.isError) return <Screen><EmptyState icon={WarningCircle} title="Answers didn't load" actions={<Button onPress={() => void answers.refetch()}>Try again</Button>} /></Screen>;

  const bank = answers.data;
  const text = (key: string) => { const value = bank.find((answer) => answer.key === key)?.value; return typeof value === "string" ? value : ""; };
  const failed = () => toast.error("Couldn't save that answer. Try again.");
  const save = (key: string, value: ApplicationAnswerValue, label?: string, index?: number) => setAnswer.mutate({ key, value, label, index }, { onError: failed });
  const clear = (key: string) => deleteAnswer.mutate(key, { onError: failed });
  const commitText = (key: string, raw: string) => { const value = raw.trim(); if (value === text(key)) return; if (value) save(key, value); else clear(key); };

  const profile = preferences.data?.search_profile;
  const sponsorship = profile ? effectiveAuthorization(profile.work_authorization, bank) : undefined;
  const chooseSponsorship = (choice: WorkAuthorization) => {
    if (profile && profile.work_authorization !== choice) updatePreferences.mutate({ search_profile: { ...profile, work_authorization: choice } }, { onError: failed });
    for (const key of staleAuthorizationKeys(choice, bank)) clear(key);
  };
  const officeDays = text("office_days");
  const hybrid = hybridOpen || (HYBRID_DAYS as readonly string[]).includes(officeDays);
  const office = hybrid ? "hybrid" : officeDays === "0" ? "remote" : officeDays === "5" ? "onsite" : undefined;
  const graduation = monthInputValue(text("graduation") || resume.data?.data.education[0]?.endDate.trim() || "");
  const pronouns = text("pronouns");
  const pronounPreset = PRONOUN_OPTIONS.find((option) => samePronoun(pronouns, option));
  const showPronounInput = pronounOther || (pronouns !== "" && !pronounPreset);
  const remembered = bank.filter((answer) => !isCommonQuestionKey(answer.key) && answer.key !== "sponsorship");
  const remove = (answer: SavedApplicationAnswer) => {
    const index = bank.findIndex((candidate) => candidate.key === answer.key);
    if (editing === answer.key) setEditing(null);
    clear(answer.key);
    toast.show({ message: "Answer deleted", duration: UNDO_TOAST_DURATION, action: { label: "Undo", run: () => save(answer.key, answer.value, answer.label, index) } });
  };

  return <Screen>
    <Stack gap="2">
      <Text size="xs" weight="semibold" tone="ink-4">COMMON QUESTIONS</Text>
      <Surface><Stack gap="5">
        <Question label="Visa sponsorship"><ToggleGroup label="Visa sponsorship" value={sponsorship} onValueChange={chooseSponsorship}
          options={[{ value: "authorized", label: "Not needed" }, { value: "sponsorship", label: "Needed" }, { value: "not_sure", label: "Not sure" }]} /></Question>
        <Question label="Days in an office">
          <ToggleGroup label="Days in an office" value={office}
            onValueChange={(choice) => { if (choice === "hybrid") { setHybridOpen(true); return; } setHybridOpen(false); save("office_days", choice === "remote" ? "0" : "5"); }}
            onClear={() => { setHybridOpen(false); clear("office_days"); }}
            options={[{ value: "remote", label: "Remote only" }, { value: "hybrid", label: "Hybrid" }, { value: "onsite", label: "Fully onsite" }]} />
          {hybrid && <ToggleGroup label="Most days a week in an office"
            value={(HYBRID_DAYS as readonly string[]).includes(officeDays) ? officeDays as typeof HYBRID_DAYS[number] : undefined}
            onValueChange={(days) => { setHybridOpen(false); save("office_days", days); }} onClear={() => clear("office_days")}
            options={HYBRID_DAYS.map((days) => ({ value: days, label: days === "1" ? "Up to 1 day" : `Up to ${days} days` }))} />}
        </Question>
        <Question label="Open to relocation"><ToggleGroup label="Open to relocation"
          value={text("relocation") === "yes" || text("relocation") === "no" ? text("relocation") as "yes" | "no" : undefined}
          onValueChange={(value) => save("relocation", value)} onClear={() => clear("relocation")}
          options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} /></Question>
        <Field label="Earliest start"><Input defaultValue={text("start_date")} placeholder="2027-06-01" maxLength={60}
          onEndEditing={(event) => commitText("start_date", event.nativeEvent.text)} /></Field>
        <Field label="Graduation"><Input defaultValue={graduation} placeholder="2027-05" keyboardType="numbers-and-punctuation" maxLength={7}
          onEndEditing={(event) => { const value = event.nativeEvent.text.trim(); if (!value || MONTH.test(value)) commitText("graduation", value ? formatResumeDate(value) : ""); }} /></Field>
        <Field label="Salary expectation"><Input defaultValue={text("salary")} maxLength={120} placeholder="$120,000" onEndEditing={(event) => commitText("salary", event.nativeEvent.text)} /></Field>
        <Question label="Pronouns">
          <ToggleGroup label="Pronouns" value={showPronounInput ? "other" : pronounPreset}
            onValueChange={(choice) => { if (choice === "other") { setPronounOther(true); if (pronounPreset) clear("pronouns"); return; } setPronounOther(false); save("pronouns", choice); }}
            onClear={() => { setPronounOther(false); clear("pronouns"); }}
            options={[...PRONOUN_OPTIONS.map((option) => ({ value: option, label: option })), { value: "other" as const, label: "Other" }]} />
          {showPronounInput && <Input accessibilityLabel="Your pronouns" defaultValue={pronounPreset ? "" : pronouns} maxLength={40} onEndEditing={(event) => commitText("pronouns", event.nativeEvent.text)} />}
        </Question>
      </Stack></Surface>
    </Stack>
    <Stack gap="2">
      <Text size="xs" weight="semibold" tone="ink-4">REMEMBERED</Text>
      {remembered.length === 0 ? <Text tone="ink-3">Answers from your applications show up here.</Text>
        : <Surface><Stack gap="3">{remembered.map((answer) => <Stack key={answer.key} gap="2">
          <View style={styles.row}>
            <Pressable style={styles.main} accessibilityRole="button" accessibilityState={{ expanded: editing === answer.key }} onPress={() => setEditing(editing === answer.key ? null : answer.key)}>
              <Text weight="medium">{answer.label || "Untitled question"}</Text>
              <Text size="sm" tone="ink-3" truncate>{display(answer.value)}</Text>
            </Pressable>
            <IconButton icon={Trash} label={`Delete answer to ${answer.label || "this question"}`} size="sm" onPress={() => remove(answer)} />
          </View>
          {editing === answer.key && <AnswerEditor answer={answer} onSave={(value) => save(answer.key, value)} onDone={() => setEditing(null)} />}
        </Stack>)}</Stack></Surface>}
    </Stack>
  </Screen>;
}

function Question({ label, children }: { label: string; children: React.ReactNode }) {
  return <Stack gap="2"><Text size="sm" weight="medium" tone="ink-2">{label}</Text>{children}</Stack>;
}

function AnswerEditor({ answer, onSave, onDone }: { answer: SavedApplicationAnswer; onSave: (value: ApplicationAnswerValue) => void; onDone: () => void }) {
  const { value } = answer;
  if (value === "yes" || value === "no") {
    return <ToggleGroup label={answer.label || "Answer"} value={value} onValueChange={(next) => { onSave(next); onDone(); }} options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />;
  }
  if (Array.isArray(value)) {
    return <View style={styles.chips}>{value.map((item) => <Button key={item} size="compact" accessibilityLabel={`Remove ${item}`} onPress={() => onSave(value.filter((candidate) => candidate !== item))}>{`${item}  ✕`}</Button>)}</View>;
  }
  const long = value.length > 80 || value.includes("\n");
  const commit = (raw: string) => { const next = raw.trim(); if (next && next !== value) onSave(next); };
  return long ? <Textarea accessibilityLabel={answer.label || "Answer"} defaultValue={value} maxLength={10000} autoFocus onEndEditing={(event) => commit(event.nativeEvent.text)} />
    : <Input accessibilityLabel={answer.label || "Answer"} defaultValue={value === "decline" ? "" : value} maxLength={10000} autoFocus
      placeholder={value === "decline" ? "Prefer not to say" : undefined} returnKeyType="done"
      onEndEditing={(event) => { commit(event.nativeEvent.text); onDone(); }} />;
}

const styles = StyleSheet.create((theme) => ({
  row: { flexDirection: "row", alignItems: "center", gap: theme.space["2"] },
  main: { flex: 1, gap: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.space["2"] },
}));
