import { hasNoLocationPreference, NO_ROLE_PREFERENCE, parseList, roleChips, rolesFromChips, visibleRoles, type Profile, type ProfilePatch } from "@pinkslip/core/profile-fields";
import {
  CAREER_STAGE_OPTIONS, EDUCATION_OPTIONS, LOCATION_OPTIONS, MAX_YEARS_EXPERIENCE, type EducationPreference, type LocationId, type WorkAuthorization, type WorkMode,
} from "@pinkslip/domain/search-profile";
import { useState, type ReactNode } from "react";
import { Disclosure, Field, Inline, Input, MultiToggleGroup, Select, Stack, Switch, Text } from "../../kit";

export interface ProfileFieldProps { profile: Profile; onChange: (patch: ProfilePatch) => void }

const workModes: { value: WorkMode; label: string }[] = [
  { value: "remote", label: "Remote" }, { value: "hybrid", label: "Hybrid" }, { value: "onsite", label: "On-site" },
];
const authorizations: { value: WorkAuthorization; label: string }[] = [
  { value: "authorized", label: "Authorized to work in the US" },
  { value: "sponsorship", label: "I need sponsorship" },
  { value: "not_sure", label: "I'm not sure" },
];

function ChipField({ label, children }: { label: string; children: ReactNode }) {
  return <Stack gap="2"><Text size="sm" weight="medium" tone="ink-2">{label}</Text>{children}</Stack>;
}

export function SwitchRow({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (value: boolean) => void }) {
  return <Inline justify="between" gap="3"><Stack flex><Text>{label}</Text></Stack><Switch label={label} checked={checked} onCheckedChange={onCheckedChange} /></Inline>;
}

function ListInput({ label, value, placeholder, onCommit }: { label: string; value: string[]; placeholder: string; onCommit: (value: string[]) => void }) {
  const [text, setText] = useState(value.join(", "));
  return <Field label={label} optional>
    <Input value={text} placeholder={placeholder} onChangeText={setText} onBlur={() => onCommit(parseList(text))} />
  </Field>;
}

/** The search-profile fields shared by Job preferences and onboarding, as
 * on the web (`SearchProfileFields.svelte`). */
export function RoleField({ profile, onChange }: ProfileFieldProps) {
  return <ChipField label="Roles">
    <MultiToggleGroup label="Roles" min={1} value={roleChips(profile)}
      onValueChange={(next) => { const patch = rolesFromChips(profile, next); if (patch) onChange(patch); }}
      options={[{ value: NO_ROLE_PREFERENCE, label: "No preference" }, ...visibleRoles.map((option) => ({ value: option.id, label: option.label }))]} />
  </ChipField>;
}

export function TitleFields({ profile, onChange }: ProfileFieldProps) {
  return <Disclosure summary="Title keywords">
    <ListInput label="Also include titles" value={profile.custom_titles} placeholder="Solutions Engineer, Developer Advocate" onCommit={(custom_titles) => onChange({ custom_titles })} />
    <ListInput label="Always exclude" value={profile.excluded_titles} placeholder="Sales, Recruiter" onCommit={(excluded_titles) => onChange({ excluded_titles })} />
  </Disclosure>;
}

export function StageField({ profile, onChange }: ProfileFieldProps) {
  return <ChipField label="Career stage">
    <MultiToggleGroup label="Career stage" min={1} value={profile.target_levels} onValueChange={(target_levels) => onChange({ target_levels })}
      options={CAREER_STAGE_OPTIONS.map((option) => ({ value: option.id, label: option.label }))} />
  </ChipField>;
}

function YearsInput({ value, onCommit }: { value: number; onCommit: (value: number) => void }) {
  const [text, setText] = useState(String(value));
  return <Field label="Years of relevant experience">
    <Input keyboardType="number-pad" value={text} onChangeText={(next) => {
      setText(next);
      const years = Number.parseInt(next, 10);
      if (Number.isFinite(years)) onCommit(Math.max(0, Math.min(40, years)));
    }} onBlur={() => setText(String(value))} />
  </Field>;
}

export function ExperienceFields({ profile, onChange }: ProfileFieldProps) {
  return <Stack gap="4">
    <YearsInput value={profile.years_experience} onCommit={(years_experience) => onChange({ years_experience })} />
    <Field label="Show jobs requiring">
      <Select label="Show jobs requiring" value={profile.max_required_years === null ? "mine" : String(profile.max_required_years)}
        onValueChange={(value) => onChange({ max_required_years: value === "mine" ? null : Number(value) })}
        options={[{ value: "mine", label: "Up to my experience" }, ...Array.from({ length: MAX_YEARS_EXPERIENCE + 1 }, (_, years) => ({
          value: String(years), label: years === 0 ? "No experience" : `Up to ${years} ${years === 1 ? "year" : "years"}`,
        }))]} />
    </Field>
    <SwitchRow label="Include jobs that don't state experience" checked={profile.include_unspecified_experience}
      onCheckedChange={(include_unspecified_experience) => onChange({ include_unspecified_experience })} />
    <Field label="Highest completed education">
      <Select<EducationPreference> label="Highest completed education" value={profile.highest_education}
        onValueChange={(highest_education) => onChange({ highest_education })}
        options={EDUCATION_OPTIONS.map((option) => ({ value: option.id, label: option.label }))} />
    </Field>
    <SwitchRow label="Currently pursuing a PhD" checked={profile.doctoral_student} onCheckedChange={(doctoral_student) => onChange({ doctoral_student })} />
  </Stack>;
}

export function WorkFields({ profile, onChange }: ProfileFieldProps) {
  return <Stack gap="4">
    <Field label="US work authorization">
      <Select<WorkAuthorization> label="US work authorization" value={profile.work_authorization} onValueChange={(work_authorization) => onChange({ work_authorization })} options={authorizations} />
    </Field>
    <ChipField label="Work mode">
      <MultiToggleGroup label="Work mode" min={1} value={profile.work_modes} onValueChange={(work_modes) => onChange({ work_modes })} options={workModes} />
    </ChipField>
  </Stack>;
}

export function MetroField({ profile, onChange }: ProfileFieldProps) {
  const anywhere = hasNoLocationPreference(profile);
  return <ChipField label="Metros">
    <MultiToggleGroup label="Metros" min={1} value={anywhere ? [NO_ROLE_PREFERENCE] : profile.location_ids}
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
    <ListInput label="Cities or regions" value={profile.custom_locations} placeholder="Portland, Raleigh, Minneapolis" onCommit={(custom_locations) => onChange({ custom_locations })} />
  </Disclosure>;
}
