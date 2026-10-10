import { useState } from "react";
import { ClipboardText, Trash, X } from "@phosphor-icons/react";
import type { ApplicationAnswerValue, SavedApplicationAnswer } from "@pinkslip/core/api";
import { formatResumeDate, monthInputValue } from "@pinkslip/core/resume-fields";
import {
  effectiveAuthorization, isCommonQuestionKey, PRONOUN_OPTIONS, staleAuthorizationKeys,
} from "@pinkslip/domain/application-answers";
import type { WorkAuthorization } from "@pinkslip/domain/search-profile";
import {
  useAnswers, useDeleteAnswer, usePreferences, useResumeProfile, useSession, useSetAnswer, useUpdatePreferences,
} from "@pinkslip/data";
import {
  Button, EmptyState, Field, Heading, IconButton, Input, Separator, Stack, Surface, Text, Textarea, toast, ToggleGroup,
  UNDO_TOAST_DURATION,
} from "../../kit";
import { InlineFailure, PageLoading } from "../states/LoadStates";
import styles from "./Answers.module.css";

const HYBRID_DAYS = ["1", "2", "3", "4"] as const;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function display(value: ApplicationAnswerValue): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === "yes") return "Yes";
  if (value === "no") return "No";
  if (value === "decline") return "Prefer not to say";
  return value;
}

/** "He/him/his" still reads as the "He/him" preset. */
function samePronoun(value: string, option: string): boolean {
  const words = (input: string) => input.toLowerCase().replace(/[^a-z]+/g, " ").trim();
  return value !== "" && (words(value) === words(option) || words(value).startsWith(`${words(option)} `));
}

/** The answer bank (`AnswersSection.svelte`): common questions answered up
 * front, then everything remembered from past applications. Each change
 * saves on its own; tapping a chosen chip again un-answers it. Sponsorship
 * is the work authorization in job preferences, not a second copy. Part of
 * auto-apply, so it shows only where that feature is on. */
export function Answers() {
  const session = useSession();
  if (!session.data?.me?.features?.auto_apply_enabled) {
    return <Stack gap="6">
      <Heading level={1} variant="screen">Application answers</Heading>
      <EmptyState icon={ClipboardText} title="Coming soon" message="Answers you give once will fill in every application." />
    </Stack>;
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

  if (answers.isPending) return <PageLoading label="Loading answers" />;
  if (answers.isError) {
    return <Stack gap="6">
      <Heading level={1} variant="screen">Application answers</Heading>
      <InlineFailure title="Answers didn't load" onRetry={() => void answers.refetch()} retrying={answers.isFetching} />
    </Stack>;
  }

  const bank = answers.data;
  const text = (key: string) => {
    const value = bank.find((answer) => answer.key === key)?.value;
    return typeof value === "string" ? value : "";
  };
  const failed = () => toast.error("Couldn't save that answer. Try again.");
  const save = (key: string, value: ApplicationAnswerValue, label?: string, index?: number) =>
    setAnswer.mutate({ key, value, label, index }, { onError: failed });
  const clear = (key: string) => deleteAnswer.mutate(key, { onError: failed });
  const commitText = (key: string, raw: string) => {
    const value = raw.trim();
    if (value === text(key)) return;
    if (value) save(key, value);
    else clear(key);
  };

  const profile = preferences.data?.search_profile;
  const sponsorship = profile ? effectiveAuthorization(profile.work_authorization, bank) : undefined;
  const chooseSponsorship = (choice: WorkAuthorization) => {
    if (profile && profile.work_authorization !== choice) {
      updatePreferences.mutate({ search_profile: { ...profile, work_authorization: choice } }, { onError: failed });
    }
    // A saved answer outranks job preferences, so one that disagrees goes.
    for (const key of staleAuthorizationKeys(choice, bank)) clear(key);
  };

  const officeDays = text("office_days");
  const hybrid = hybridOpen || (HYBRID_DAYS as readonly string[]).includes(officeDays);
  const office = hybrid ? "hybrid" : officeDays === "0" ? "remote" : officeDays === "5" ? "onsite" : undefined;
  const startDate = text("start_date");
  const graduation = monthInputValue(text("graduation") || resume.data?.data.education[0]?.endDate.trim() || "");
  const pronouns = text("pronouns");
  const pronounPreset = PRONOUN_OPTIONS.find((option) => samePronoun(pronouns, option));
  const showPronounInput = pronounOther || (pronouns !== "" && !pronounPreset);
  const remembered = bank.filter((answer) => !isCommonQuestionKey(answer.key) && answer.key !== "sponsorship");

  const remove = (answer: SavedApplicationAnswer) => {
    const index = bank.findIndex((candidate) => candidate.key === answer.key);
    if (editing === answer.key) setEditing(null);
    clear(answer.key);
    toast.show({
      message: "Answer deleted", duration: UNDO_TOAST_DURATION,
      action: { label: "Undo", run: () => save(answer.key, answer.value, answer.label, index) },
    });
  };

  return <Stack gap="6">
    <Heading level={1} variant="screen">Application answers</Heading>

    <Stack as="section" gap="2">
      <Heading level={2} variant="section">Common questions</Heading>
      <Surface variant="card">
        <Stack gap="5">
          <Question label="Visa sponsorship">
            <ToggleGroup label="Visa sponsorship" value={sponsorship} onValueChange={chooseSponsorship}
              options={[{ value: "authorized", label: "Not needed" }, { value: "sponsorship", label: "Needed" }, { value: "not_sure", label: "Not sure" }]} />
          </Question>
          <Question label="Days in an office">
            <ToggleGroup label="Days in an office" value={office}
              onValueChange={(choice) => {
                if (choice === "hybrid") { setHybridOpen(true); return; }
                setHybridOpen(false);
                save("office_days", choice === "remote" ? "0" : "5");
              }}
              onClear={() => { setHybridOpen(false); clear("office_days"); }}
              options={[{ value: "remote", label: "Remote only" }, { value: "hybrid", label: "Hybrid" }, { value: "onsite", label: "Fully onsite" }]} />
            {hybrid && <ToggleGroup label="Most days a week in an office"
              value={(HYBRID_DAYS as readonly string[]).includes(officeDays) ? officeDays as typeof HYBRID_DAYS[number] : undefined}
              onValueChange={(days) => { setHybridOpen(false); save("office_days", days); }}
              onClear={() => clear("office_days")}
              options={HYBRID_DAYS.map((days) => ({ value: days, label: days === "1" ? "Up to 1 day" : `Up to ${days} days` }))} />}
          </Question>
          <Question label="Open to relocation">
            <ToggleGroup label="Open to relocation" value={text("relocation") === "yes" || text("relocation") === "no" ? text("relocation") as "yes" | "no" : undefined}
              onValueChange={(value) => save("relocation", value)} onClear={() => clear("relocation")}
              options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
          </Question>
          <div className={styles.pair}>
            <Field label="Earliest start">
              {startDate && !ISO_DATE.test(startDate)
                ? <Input defaultValue={startDate} maxLength={60} onBlur={(event) => commitText("start_date", event.target.value)} />
                : <Input type="date" value={startDate} onChange={(event) => commitText("start_date", event.target.value)} />}
            </Field>
            <Field label="Graduation">
              <Input type="month" value={graduation}
                onChange={(event) => commitText("graduation", event.target.value ? formatResumeDate(event.target.value) : "")} />
            </Field>
          </div>
          <Field label="Salary expectation">
            <Input defaultValue={text("salary")} maxLength={120} placeholder="$120,000" onBlur={(event) => commitText("salary", event.target.value)} />
          </Field>
          <Question label="Pronouns">
            <ToggleGroup label="Pronouns" value={showPronounInput ? "other" : pronounPreset}
              onValueChange={(choice) => {
                if (choice === "other") {
                  setPronounOther(true);
                  if (pronounPreset) clear("pronouns");
                  return;
                }
                setPronounOther(false);
                save("pronouns", choice);
              }}
              onClear={() => { setPronounOther(false); clear("pronouns"); }}
              options={[...PRONOUN_OPTIONS.map((option) => ({ value: option, label: option })), { value: "other" as const, label: "Other" }]} />
            {showPronounInput && <Input aria-label="Your pronouns" defaultValue={pronounPreset ? "" : pronouns} maxLength={40}
              onBlur={(event) => commitText("pronouns", event.target.value)} />}
          </Question>
        </Stack>
      </Surface>
    </Stack>

    <Stack as="section" gap="2">
      <Heading level={2} variant="section">Remembered</Heading>
      {remembered.length === 0
        ? <Text tone="ink-3">Answers from your applications show up here.</Text>
        : <Surface variant="list" bleedOnPhone as="ul">
          {remembered.map((answer, index) => <li key={answer.key} className={styles.item}>
            {index > 0 && <Separator />}
            <div className={styles.row}>
              <button type="button" className={styles.rowMain} aria-expanded={editing === answer.key}
                onClick={() => setEditing(editing === answer.key ? null : answer.key)}>
                <Text as="span" weight="medium">{answer.label || "Untitled question"}</Text>
                <Text as="span" size="sm" tone="ink-3" truncate>{display(answer.value)}</Text>
              </button>
              <IconButton icon={Trash} label={`Delete answer to ${answer.label || "this question"}`} size="sm" iconSize={16} onClick={() => remove(answer)} />
            </div>
            {editing === answer.key && <div className={styles.editor}>
              <AnswerEditor answer={answer} onSave={(value) => save(answer.key, value)} onDone={() => setEditing(null)} />
            </div>}
          </li>)}
        </Surface>}
    </Stack>
  </Stack>;
}

function Question({ label, children }: { label: string; children: React.ReactNode }) {
  return <Stack gap="2">
    <Text size="sm" weight="medium" tone="ink-2">{label}</Text>
    {children}
  </Stack>;
}

/** Edits one remembered answer in place: yes/no as chips, lists as
 * removable chips, text as a field that saves when it loses focus. */
function AnswerEditor({ answer, onSave, onDone }: { answer: SavedApplicationAnswer; onSave: (value: ApplicationAnswerValue) => void; onDone: () => void }) {
  const { value } = answer;
  if (value === "yes" || value === "no") {
    return <ToggleGroup label={answer.label || "Answer"} value={value} onValueChange={(next) => { onSave(next); onDone(); }}
      options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />;
  }
  if (Array.isArray(value)) {
    return <div className={styles.chips}>
      {value.map((item) => <Button key={item} variant="secondary" size="compact" icon={X} aria-label={`Remove ${item}`}
        onClick={() => onSave(value.filter((candidate) => candidate !== item))}>{item}</Button>)}
    </div>;
  }
  const long = value.length > 80 || value.includes("\n");
  const commit = (raw: string) => { const next = raw.trim(); if (next && next !== value) onSave(next); };
  return long
    ? <Textarea aria-label={answer.label || "Answer"} defaultValue={value} maxLength={10000} autoFocus
      onBlur={(event) => commit(event.target.value)} />
    : <Input aria-label={answer.label || "Answer"} defaultValue={value === "decline" ? "" : value} maxLength={10000} autoFocus
      placeholder={value === "decline" ? "Prefer not to say" : undefined}
      onBlur={(event) => commit(event.target.value)}
      onKeyDown={(event) => { if (event.key === "Enter") { event.currentTarget.blur(); onDone(); } }} />;
}
