import { useId, useState } from "react";
import {
  CAREER_STAGE_OPTIONS, EDUCATION_OPTIONS, LOCATION_OPTIONS, MAX_YEARS_EXPERIENCE,
  type EducationPreference, type LocationId, type WorkAuthorization, type WorkMode,
} from "@pinkslip/domain/search-profile";
import {
  Disclosure, Field, Input, Menu, MenuCheckboxItem, MultiToggleGroup, Select, Stack, Switch, Text,
} from "../../kit";
import {
  hasNoLocationPreference, NO_ROLE_PREFERENCE, parseList, roleChips, rolesFromChips, visibleRoles,
  type Profile, type ProfilePatch,
} from "./profile";
import styles from "./Preferences.module.css";

export interface ProfileFieldProps {
  profile: Profile;
  onChange: (patch: ProfilePatch) => void;
}

const workModes: { id: WorkMode; label: string }[] = [
  { id: "remote", label: "Remote" },
  { id: "hybrid", label: "Hybrid" },
  { id: "onsite", label: "On-site" },
];

const authorizations: { id: WorkAuthorization; label: string }[] = [
  { id: "authorized", label: "Authorized to work in the US" },
  { id: "sponsorship", label: "I need sponsorship" },
  { id: "not_sure", label: "I’m not sure" },
];

/** A labelled group of chips; the label names the group for assistive tech. */
function ChipField({ label, children }: { label: string; children: React.ReactNode }) {
  return <Stack gap="2">
    <Text size="sm" weight="medium" tone="ink-2">{label}</Text>
    {children}
  </Stack>;
}

/** A switch with its label on the left, the settings-row way. */
function SwitchRow({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (value: boolean) => void }) {
  return <div className={styles.switchRow}>
    <Text>{label}</Text>
    <Switch label={label} checked={checked} onCheckedChange={onCheckedChange} />
  </div>;
}

/** A comma-separated list, committed when the field loses focus. */
function ListInput({ label, value, placeholder, onCommit }: { label: string; value: string[]; placeholder: string; onCommit: (value: string[]) => void }) {
  const [text, setText] = useState(value.join(", "));
  return <Field label={label} optional>
    <Input value={text} placeholder={placeholder} onChange={(event) => setText(event.target.value)}
      onBlur={() => onCommit(parseList(text))} />
  </Field>;
}

export function RoleField({ profile, onChange }: ProfileFieldProps) {
  return <ChipField label="Roles">
    <MultiToggleGroup label="Roles" min={1} value={roleChips(profile)}
      onValueChange={(next) => { const patch = rolesFromChips(profile, next); if (patch) onChange(patch); }}
      options={[{ value: NO_ROLE_PREFERENCE, label: "No preference" }, ...visibleRoles.map((option) => ({ value: option.id, label: option.label }))]} />
  </ChipField>;
}

/** Extra title keywords, folded away: most people never need them. */
export function TitleFields({ profile, onChange }: ProfileFieldProps) {
  return <Disclosure summary="Title keywords">
    <Stack gap="4">
      <ListInput label="Also include titles" value={profile.custom_titles} placeholder="Solutions Engineer, Developer Advocate"
        onCommit={(custom_titles) => onChange({ custom_titles })} />
      <ListInput label="Always exclude" value={profile.excluded_titles} placeholder="Sales, Recruiter"
        onCommit={(excluded_titles) => onChange({ excluded_titles })} />
    </Stack>
  </Disclosure>;
}

export function StageField({ profile, onChange }: ProfileFieldProps) {
  return <ChipField label="Career stage">
    <MultiToggleGroup label="Career stage" min={1} value={profile.target_levels}
      onValueChange={(target_levels) => onChange({ target_levels })}
      options={CAREER_STAGE_OPTIONS.map((option) => ({ value: option.id, label: option.label }))} />
  </ChipField>;
}

function YearsInput({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  return <Field label="Years of relevant experience">
    <Input type="number" inputMode="numeric" min={0} max={40} step={1} value={text}
      onChange={(event) => {
        setText(event.target.value);
        const years = Number.parseInt(event.target.value, 10);
        if (Number.isFinite(years)) onCommit(Math.max(0, Math.min(40, years)));
      }}
      onBlur={() => setText(String(value))} />
  </Field>;
}

export function ExperienceFields({ profile, onChange }: ProfileFieldProps) {
  return <Stack gap="4">
    <YearsInput value={profile.years_experience} onCommit={(years_experience) => onChange({ years_experience })} />
    <Field label="Show jobs requiring">
      <Select value={profile.max_required_years === null ? "mine" : String(profile.max_required_years)}
        onChange={(event) => onChange({ max_required_years: event.target.value === "mine" ? null : Number(event.target.value) })}>
        <option value="mine">Up to my experience</option>
        {Array.from({ length: MAX_YEARS_EXPERIENCE + 1 }, (_, years) => <option key={years} value={String(years)}>
          {years === 0 ? "No experience" : `Up to ${years} ${years === 1 ? "year" : "years"}`}
        </option>)}
      </Select>
    </Field>
    <SwitchRow label="Include jobs that don’t state experience" checked={profile.include_unspecified_experience}
      onCheckedChange={(include_unspecified_experience) => onChange({ include_unspecified_experience })} />
    <Field label="Highest completed education">
      <Select value={profile.highest_education} onChange={(event) => onChange({ highest_education: event.target.value as EducationPreference })}>
        {EDUCATION_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </Select>
    </Field>
    <SwitchRow label="Currently pursuing a PhD" checked={profile.doctoral_student}
      onCheckedChange={(doctoral_student) => onChange({ doctoral_student })} />
  </Stack>;
}

export function WorkFields({ profile, onChange }: ProfileFieldProps) {
  const workModeLabel = useId();
  const summary = profile.work_modes.length === workModes.length ? "Any"
    : workModes.filter((mode) => profile.work_modes.includes(mode.id)).map((mode) => mode.label).join(", ");
  return <Stack gap="4">
    <Field label="US work authorization">
      <Select value={profile.work_authorization} onChange={(event) => onChange({ work_authorization: event.target.value as WorkAuthorization })}>
        {authorizations.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
      </Select>
    </Field>
    <Stack gap="2">
      <Text id={workModeLabel} size="sm" weight="medium" tone="ink-2">Work mode</Text>
      <Menu label="Work modes" align="start" trigger={{ placeholder: "Choose work modes", value: summary, labelledBy: workModeLabel }}>
        {workModes.map((mode) => <MenuCheckboxItem key={mode.id} checked={profile.work_modes.includes(mode.id)}
          onCheckedChange={(checked) => {
            const next = workModes.map((option) => option.id)
              .filter((id) => (id === mode.id ? checked : profile.work_modes.includes(id)));
            if (next.length > 0) onChange({ work_modes: next });
          }}>{mode.label}</MenuCheckboxItem>)}
      </Menu>
    </Stack>
  </Stack>;
}

export function MetroField({ profile, onChange }: ProfileFieldProps) {
  const anywhere = hasNoLocationPreference(profile);
  return <ChipField label="Metros">
    <MultiToggleGroup label="Metros" min={1}
      value={anywhere ? [NO_ROLE_PREFERENCE] : profile.location_ids}
      onValueChange={(next) => {
        if (!anywhere && next.includes(NO_ROLE_PREFERENCE)) return onChange({ location_ids: [], relocation_willing: false });
        const location_ids = next.filter((id) => id !== NO_ROLE_PREFERENCE) as LocationId[];
        if (location_ids.length > 0) onChange({ location_ids, relocation_willing: false });
      }}
      options={[{ value: NO_ROLE_PREFERENCE, label: "Anywhere in the US" }, ...LOCATION_OPTIONS.map((option) => ({ value: option.id, label: option.label }))]} />
  </ChipField>;
}

export function OtherLocations({ profile, onChange }: ProfileFieldProps) {
  return <Disclosure summary="Other cities">
    <ListInput label="Cities or regions" value={profile.custom_locations} placeholder="Portland, Raleigh, Minneapolis"
      onCommit={(custom_locations) => onChange({ custom_locations })} />
  </Disclosure>;
}
