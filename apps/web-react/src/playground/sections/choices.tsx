import { Checkbox, CheckboxGroup, ChoiceLabel, Radio, RadioGroup, Switch } from "@pinkslip/ui/choice";
import { Separator } from "@pinkslip/ui/display";
import { useState } from "react";
import { Group, Specimen } from "../specimen";

const workModes = ["remote", "hybrid", "onsite"];

function SettingRow({ id, label, description, defaultChecked }: { id: string; label: string; description: string; defaultChecked?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <label htmlFor={id} className="flex min-w-0 cursor-pointer flex-col">
        <span className="text-ui text-ink">{label}</span>
        <span className="text-meta text-ink-3">{description}</span>
      </label>
      <Switch id={id} defaultChecked={defaultChecked} />
    </div>
  );
}

export function ChoicesGroup() {
  const [modes, setModes] = useState<string[]>(["remote", "hybrid"]);

  return (
    <Group id="choices" title="Choices">
      <Specimen name="Checkbox" use="Independent yes-or-no choices in search preferences.">
        <ChoiceLabel
          control={<Checkbox defaultChecked />}
          label="Include internships"
          description="Summer 2027 roles show up alongside full-time ones."
        />
      </Specimen>

      <Specimen name="Checkbox Group" use="Several related choices, with a parent that selects them all.">
        <CheckboxGroup value={modes} onValueChange={setModes} allValues={workModes} aria-labelledby="work-mode-label">
          <span id="work-mode-label" className="text-ui font-medium text-ink">
            Work mode
          </span>
          <ChoiceLabel control={<Checkbox parent />} label="Any work mode" />
          <div className="flex flex-col gap-3 pl-7">
            <ChoiceLabel control={<Checkbox value="remote" />} label="Remote" />
            <ChoiceLabel control={<Checkbox value="hybrid" />} label="Hybrid" />
            <ChoiceLabel control={<Checkbox value="onsite" />} label="On-site" />
          </div>
        </CheckboxGroup>
      </Specimen>

      <Specimen name="Radio Group" use="Exactly one choice, when every option deserves to be seen at once.">
        <RadioGroup defaultValue="new-grad" aria-labelledby="stage-label">
          <span id="stage-label" className="text-ui font-medium text-ink">
            Career stage
          </span>
          <ChoiceLabel control={<Radio value="intern" />} label="Internship" description="Students graduating in 2027 or later." />
          <ChoiceLabel control={<Radio value="new-grad" />} label="New grad" description="Graduating this year or last." />
          <ChoiceLabel control={<Radio value="early" />} label="Early career" description="Up to three years of experience." />
        </RadioGroup>
      </Specimen>

      <Specimen name="Switch" use="Settings that take effect immediately, with no Save button.">
        <div className="flex max-w-110 flex-col">
          <SettingRow id="instant-alerts" label="Instant alerts" description="A notification within minutes of a posting." defaultChecked />
          <Separator />
          <SettingRow id="weekly-summary" label="Weekly summary" description="One email each Monday with the week's best matches." />
          <Separator />
          <SettingRow id="show-salary" label="Show salary first" description="Lead each row with pay when the posting lists it." defaultChecked />
        </div>
      </Specimen>
    </Group>
  );
}
