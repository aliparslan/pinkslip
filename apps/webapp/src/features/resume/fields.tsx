import { Plus, X } from "@phosphor-icons/react";
import { joinUsLocation, monthInputValue, splitUsLocation, US_STATES } from "@pinkslip/core/resume-fields";
import { Button, Field, IconButton, Input, Select, Stack, Switch, Text, Textarea } from "../../kit";
import styles from "./Resume.module.css";

/** One labelled text input. */
export function TextField({ label, value, onChange, optional, type = "text", autoComplete, placeholder, inputMode }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  optional?: boolean;
  type?: "text" | "email" | "tel" | "url";
  autoComplete?: string;
  placeholder?: string;
  inputMode?: "text" | "email" | "tel" | "url" | "decimal";
}) {
  return <Field label={label} optional={optional}>
    <Input type={type} value={value} autoComplete={autoComplete} placeholder={placeholder} inputMode={inputMode}
      onChange={(event) => onChange(event.target.value)} />
  </Field>;
}

/** City and state, stored as "City, ST" like the current app. */
export function CityState({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { city, state } = splitUsLocation(value);
  return <div className={styles.pair}>
    <TextField label="City" optional value={city} autoComplete="address-level2" onChange={(next) => onChange(joinUsLocation(next, state))} />
    <Field label="State" optional>
      <Select value={state} autoComplete="address-level1" onChange={(event) => onChange(joinUsLocation(city, event.target.value))}>
        <option value="">None</option>
        {US_STATES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
    </Field>
  </div>;
}

/** A month, stored as YYYY-MM (older free-text dates are read as months). */
export function MonthField({ label, value, onChange, optional = true }: { label: string; value: string; onChange: (value: string) => void; optional?: boolean }) {
  return <Field label={label} optional={optional}>
    <Input type="month" value={monthInputValue(value)} onChange={(event) => onChange(event.target.value)} />
  </Field>;
}

/** Start and end months, with "I'm still here" setting the end to Present. */
export function DateRange({ start, end, onChange, currentLabel }: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
  currentLabel?: string;
}) {
  const current = /^(present|current)$/i.test(end.trim());
  return <Stack gap="3">
    <div className={styles.pair}>
      <MonthField label="Start" value={start} onChange={(next) => onChange(next, end)} />
      {!current && <MonthField label="End" value={end} onChange={(next) => onChange(start, next)} />}
    </div>
    {currentLabel && <div className={styles.switchRow}>
      <Text>{currentLabel}</Text>
      <Switch label={currentLabel} checked={current} onCheckedChange={(on) => onChange(start, on ? "Present" : "")} />
    </div>}
  </Stack>;
}

/** Accomplishment bullets: one text box each, always at least one. */
export function Bullets({ label, items, placeholder, onChange }: { label: string; items: string[]; placeholder: string; onChange: (items: string[]) => void }) {
  return <Stack gap="2">
    <Text size="sm" weight="medium" tone="ink-2">{label}</Text>
    {items.map((item, index) => <div key={index} className={styles.removable}>
      <Textarea aria-label={`${label} ${index + 1}`} value={item} placeholder={placeholder} rows={2}
        onChange={(event) => onChange(items.map((current, at) => (at === index ? event.target.value : current)))} />
      {items.length > 1 && <IconButton icon={X} label={`Remove ${label.toLowerCase()} ${index + 1}`} size="sm" iconSize={16}
        onClick={() => onChange(items.filter((_, at) => at !== index))} />}
    </div>)}
    <div><Button variant="secondary" size="compact" icon={Plus} onClick={() => onChange([...items, ""])}>Add another</Button></div>
  </Stack>;
}

export interface Pair { category: string; items: string }

/** Named groups (skills, certifications…): a title and its details. */
export function PairList({ titleLabel, detailLabel, detailPlaceholder, items, onChange }: {
  titleLabel: string;
  detailLabel: string;
  detailPlaceholder: string;
  items: Pair[];
  onChange: (items: Pair[]) => void;
}) {
  const update = (index: number, patch: Partial<Pair>) => onChange(items.map((item, at) => (at === index ? { ...item, ...patch } : item)));
  return <Stack gap="4">
    {items.map((item, index) => <div key={index} className={styles.group}>
      <div className={styles.removable}>
        <TextField label={titleLabel} value={item.category} onChange={(category) => update(index, { category })} />
        <IconButton icon={X} label={`Remove ${item.category || `item ${index + 1}`}`} size="sm" iconSize={16}
          onClick={() => onChange(items.filter((_, at) => at !== index))} />
      </div>
      <Field label={detailLabel}>
        <Textarea value={item.items} placeholder={detailPlaceholder} rows={2} onChange={(event) => update(index, { items: event.target.value })} />
      </Field>
    </div>)}
    <div><Button variant="secondary" size="compact" icon={Plus} onClick={() => onChange([...items, { category: "", items: "" }])}>Add another</Button></div>
  </Stack>;
}
