import { useEffect, useState } from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";
import type { ApplicationAnswerValue, PreparedApplication } from "@pinkslip/core/api";
import { isAnswered, type PreparedApplicationField } from "@pinkslip/domain/application-form";
import { useAnswerPreparedField, usePreparedApplication } from "@pinkslip/data";
import {
  Alert, Button, Disclosure, Field, Input, MultiToggleGroup, Select, Sheet, Spinner, Stack, Text, Textarea, toast, ToggleGroup,
} from "../../kit";
import styles from "./Apply.module.css";

const inputType = (field: PreparedApplicationField) =>
  field.type === "email" ? "email" : field.type === "phone" ? "tel" : field.type === "url" ? "url" : field.type === "date" ? "date" : "text";

const usesChips = (field: PreparedApplicationField) => field.type === "boolean" || field.type === "multiselect"
  || (field.options.length <= 4 && field.options.every((option) => option.label.length <= 40));

function summary(group: PreparedApplicationField[]): string {
  if (group.every((field) => field.source === "default")) return "Declined";
  const open = group.filter((field) => !isAnswered(field.answer)).length;
  return open > 0 ? `${open} open` : "Filled";
}

/** `ApplicationPrepSheet.svelte`: the employer's form with the answers
 * Pinkslip already has, so the questions that need the person come first.
 * Each answer saves on its own and is remembered for later applications.
 * The web can't fill another site's form, so "Open application" opens it in
 * a new tab with the answers reviewed; filling it in comes with the iOS app.
 * Forms Pinkslip can't read skip the sheet and open directly. */
export function ApplicationPrepSheet({ jobId, companyName, open, onOpenChange, onOpenApplication }: {
  jobId: string;
  companyName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenApplication: (url: string | null) => void;
}) {
  const prepared = usePreparedApplication(jobId, open);
  // Fixed when the form loads, so answering a question doesn't move it.
  const [needsIds, setNeedsIds] = useState<Set<string> | null>(null);
  const data = prepared.data;

  useEffect(() => {
    if (!open) { setNeedsIds(null); return; }
    if (!data) return;
    if (!data.supported) {
      onOpenChange(false);
      onOpenApplication(null);
      return;
    }
    setNeedsIds((current) => current ?? new Set(data.fields.filter((field) => field.required && !isAnswered(field.answer)).map((field) => field.id)));
  }, [open, data, onOpenChange, onOpenApplication]);

  const missing = data?.missing_required ?? 0;
  return <Sheet open={open} onOpenChange={onOpenChange} title={`Apply to ${companyName}`}
    footer={data?.supported && <Button variant="primary" fullWidth icon={ArrowSquareOut}
      onClick={() => { onOpenChange(false); onOpenApplication(data.apply_url); }}>
      {missing > 0 ? `Open application · ${missing} to answer` : "Open application"}
    </Button>}>
    {prepared.isPending ? <div className={styles.loading}><Spinner size={20} label="Loading application" /></div>
      : prepared.isError ? <Stack gap="3">
        <Alert tone="error">Couldn't read this application.</Alert>
        <Button fullWidth pending={prepared.isFetching} onClick={() => void prepared.refetch()}>Try again</Button>
        <Button fullWidth onClick={() => { onOpenChange(false); onOpenApplication(null); }}>Open the application anyway</Button>
      </Stack>
      : data?.supported && needsIds ? <PrepFields jobId={jobId} prepared={data} needsIds={needsIds} />
      : null}
  </Sheet>;
}

function PrepFields({ jobId, prepared, needsIds }: { jobId: string; prepared: PreparedApplication; needsIds: Set<string> }) {
  const answer = useAnswerPreparedField(jobId);
  const save = (field: PreparedApplicationField, value: ApplicationAnswerValue | null) =>
    answer.mutate({ fieldId: field.id, value }, { onError: () => toast.error("Couldn't save that answer. Try again.") });
  const fields = prepared.fields;
  const needs = fields.filter((field) => needsIds.has(field.id));
  const rest = (section: PreparedApplicationField["section"]) => fields.filter((field) => !needsIds.has(field.id) && field.section === section);
  const questions = rest("questions");
  const about = rest("about");
  const voluntary = rest("voluntary");
  const control = (field: PreparedApplicationField) => <PrepField key={field.id} field={field} disabled={answer.isPending} onSave={(value) => save(field, value)} />;

  return <Stack gap="6">
    {needs.length > 0 && <Stack as="section" gap="4" aria-label="Needs you">
      <Text size="xs" weight="semibold" tone="ink-4">Needs you</Text>
      {needs.map(control)}
    </Stack>}
    {questions.length > 0 && <Stack as="section" gap="4" aria-label="Questions">
      <Text size="xs" weight="semibold" tone="ink-4">Questions</Text>
      {questions.map(control)}
    </Stack>}
    {about.length > 0 && <Disclosure summary={`About you · ${summary(about)}`}><Stack gap="4">{about.map(control)}</Stack></Disclosure>}
    {voluntary.length > 0 && <Disclosure summary={`Voluntary · ${summary(voluntary)}`}><Stack gap="4">{voluntary.map(control)}</Stack></Disclosure>}
  </Stack>;
}

function PrepField({ field, disabled, onSave }: { field: PreparedApplicationField; disabled: boolean; onSave: (value: ApplicationAnswerValue | null) => void }) {
  const current = typeof field.answer === "string" ? field.answer : "";
  const commit = (raw: string) => { if (raw !== current) onSave(raw.trim() ? raw : null); };
  const label = field.label;

  if (field.type === "file") {
    return <Stack gap="1"><Text size="sm" weight="medium" tone="ink-2">{label}</Text><Text size="sm" tone="ink-3">{field.answer ?? "Add in the form"}</Text></Stack>;
  }
  if (field.type === "select" || field.type === "boolean" || field.type === "multiselect") {
    const options = field.options.map((option) => ({ value: option.label, label: option.label }));
    if (field.type === "multiselect") {
      return <Stack gap="2">
        <Text size="sm" weight="medium" tone="ink-2">{label}</Text>
        <MultiToggleGroup label={label} options={options} value={Array.isArray(field.answer) ? field.answer : []} min={0}
          onValueChange={(next) => onSave(next.length > 0 ? next : null)} />
      </Stack>;
    }
    if (usesChips(field)) {
      return <Stack gap="2">
        <Text size="sm" weight="medium" tone="ink-2">{label}</Text>
        <ToggleGroup label={label} options={options} value={current || undefined} onValueChange={(next) => onSave(next)} onClear={() => onSave(null)} />
      </Stack>;
    }
    return <Field label={label}>
      <Select value={current} disabled={disabled} onChange={(event) => onSave(event.target.value || null)}>
        <option value="">Choose</option>
        {field.options.map((option) => <option key={option.value} value={option.label}>{option.label}</option>)}
      </Select>
    </Field>;
  }
  return <Field label={label}>
    {field.type === "textarea"
      ? <Textarea key={current} defaultValue={current} rows={4} onBlur={(event) => commit(event.target.value)} />
      : <Input key={current} type={inputType(field)} defaultValue={current} inputMode={field.type === "number" ? "decimal" : undefined}
        onBlur={(event) => commit(event.target.value)} />}
  </Field>;
}
