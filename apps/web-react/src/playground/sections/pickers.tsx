import { Autocomplete, Combobox } from "@pinkslip/ui/combobox";
import { CheckIcon, ChevronDownIcon, ChevronUpDownIcon, CloseIcon } from "@pinkslip/ui/icons";
import { Select } from "@pinkslip/ui/select";
import { Fragment } from "react";
import { companies, roles } from "../data";
import { Group, Specimen } from "../specimen";

const cadences = [
  { value: "instant", label: "Instant" },
  { value: "hourly", label: "Every hour" },
  { value: "daily", label: "Daily at 9 AM" },
];

const locations = [
  { label: "Remote", items: [{ value: "remote-us", label: "Remote, US" }] },
  {
    label: "Cities",
    items: [
      { value: "nyc", label: "New York" },
      { value: "sf", label: "San Francisco Bay Area" },
      { value: "sea", label: "Seattle" },
      { value: "aus", label: "Austin" },
      { value: "chi", label: "Chicago" },
    ],
  },
];

export function PickersGroup() {
  return (
    <Group id="pickers" title="Pickers">
      <Specimen name="Select" use="One choice from a list too long for a segmented control.">
        <div className="flex flex-wrap gap-6">
          <Select.Root items={cadences} defaultValue="instant">
            <div className="flex flex-col gap-1.5">
              <Select.Label>Alert cadence</Select.Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Icon>
                  <ChevronUpDownIcon size={14} />
                </Select.Icon>
              </Select.Trigger>
            </div>
            <Select.Portal>
              <Select.Positioner sideOffset={6}>
                <Select.Popup>
                  <Select.List>
                    {cadences.map((cadence) => (
                      <Select.Item key={cadence.value} value={cadence.value}>
                        <Select.ItemIndicator>
                          <CheckIcon size={14} />
                        </Select.ItemIndicator>
                        <Select.ItemText>{cadence.label}</Select.ItemText>
                      </Select.Item>
                    ))}
                  </Select.List>
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>

          <Select.Root items={locations.flatMap((group) => group.items)} defaultValue="nyc">
            <div className="flex flex-col gap-1.5">
              <Select.Label>Location</Select.Label>
              <Select.Trigger>
                <Select.Value />
                <Select.Icon>
                  <ChevronUpDownIcon size={14} />
                </Select.Icon>
              </Select.Trigger>
            </div>
            <Select.Portal>
              <Select.Positioner sideOffset={6} alignItemWithTrigger={false}>
                <Select.Popup>
                  <Select.List>
                    {locations.map((group, index) => (
                      <Fragment key={group.label}>
                        {index > 0 ? <Select.Separator /> : null}
                        <Select.Group>
                          <Select.GroupLabel>{group.label}</Select.GroupLabel>
                          {group.items.map((location) => (
                            <Select.Item key={location.value} value={location.value}>
                              <Select.ItemIndicator>
                                <CheckIcon size={14} />
                              </Select.ItemIndicator>
                              <Select.ItemText>{location.label}</Select.ItemText>
                            </Select.Item>
                          ))}
                        </Select.Group>
                      </Fragment>
                    ))}
                  </Select.List>
                </Select.Popup>
              </Select.Positioner>
            </Select.Portal>
          </Select.Root>
        </div>
      </Specimen>

      <Specimen name="Combobox" use="Choose several companies from a long list by typing a few letters.">
        <Combobox.Root items={companies} multiple defaultValue={["Ramp", "Figma"]}>
          <div className="flex max-w-110 flex-col gap-1.5">
            <Combobox.Label>Companies to watch</Combobox.Label>
            <Combobox.Chips>
              <Combobox.Value>
                {(value: string[]) => (
                  <>
                    {value.map((company) => (
                      <Combobox.Chip key={company} aria-label={company}>
                        {company}
                        <Combobox.ChipRemove aria-label={`Remove ${company}`}>
                          <CloseIcon size={12} />
                        </Combobox.ChipRemove>
                      </Combobox.Chip>
                    ))}
                    <Combobox.ChipInput placeholder={value.length > 0 ? "" : "Add a company"} />
                  </>
                )}
              </Combobox.Value>
            </Combobox.Chips>
          </div>
          <Combobox.Portal>
            <Combobox.Positioner sideOffset={6}>
              <Combobox.Popup>
                <Combobox.Empty>No company by that name yet. Request it from Companies.</Combobox.Empty>
                <Combobox.List>
                  {(company: string) => (
                    <Combobox.Item key={company} value={company}>
                      <Combobox.ItemIndicator>
                        <CheckIcon size={14} />
                      </Combobox.ItemIndicator>
                      <span className="col-start-2">{company}</span>
                    </Combobox.Item>
                  )}
                </Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        </Combobox.Root>

        <Combobox.Root items={companies}>
          <div className="flex max-w-110 flex-col gap-1.5">
            <Combobox.Label>Company</Combobox.Label>
            <Combobox.InputGroup>
              <Combobox.Input placeholder="Pick one company" className="pr-9" />
              <Combobox.Trigger aria-label="Show companies">
                <ChevronDownIcon size={14} />
              </Combobox.Trigger>
            </Combobox.InputGroup>
          </div>
          <Combobox.Portal>
            <Combobox.Positioner sideOffset={6}>
              <Combobox.Popup>
                <Combobox.Empty>No company by that name yet.</Combobox.Empty>
                <Combobox.List>
                  {(company: string) => (
                    <Combobox.Item key={company} value={company}>
                      <Combobox.ItemIndicator>
                        <CheckIcon size={14} />
                      </Combobox.ItemIndicator>
                      <span className="col-start-2">{company}</span>
                    </Combobox.Item>
                  )}
                </Combobox.List>
              </Combobox.Popup>
            </Combobox.Positioner>
          </Combobox.Portal>
        </Combobox.Root>
      </Specimen>

      <Specimen name="Autocomplete" use="Free text with suggestions. Whatever is typed is kept, even if it is not in the list.">
        <Autocomplete.Root items={roles}>
          <label className="flex max-w-110 flex-col gap-1.5">
            <span className="text-ui font-medium text-ink">Target title</span>
            <Autocomplete.Input placeholder="Software Engineer, New Grad" />
          </label>
          <Autocomplete.Portal>
            <Autocomplete.Positioner sideOffset={6}>
              <Autocomplete.Popup>
                <Autocomplete.Empty>Keep typing. Any title works.</Autocomplete.Empty>
                <Autocomplete.List>
                  {(role: string) => (
                    <Autocomplete.Item key={role} value={role}>
                      {role}
                    </Autocomplete.Item>
                  )}
                </Autocomplete.List>
              </Autocomplete.Popup>
            </Autocomplete.Positioner>
          </Autocomplete.Portal>
        </Autocomplete.Root>
      </Specimen>
    </Group>
  );
}
