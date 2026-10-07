import { Toggle as BaseToggle } from "@base-ui/react/toggle";
import { Button } from "@pinkslip/ui/button";
import { Tooltip } from "@pinkslip/ui/floating";
import { BookmarkIcon, MoreIcon, ShareIcon } from "@pinkslip/ui/icons";
import { Segment, Segmented, Toggle, Toolbar } from "@pinkslip/ui/toggle";
import { useState, type ReactNode } from "react";
import { Group, Row, Specimen } from "../specimen";

export function IconButton({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={<Button variant="ghost" size="icon" aria-label={label} />}>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={8}>
          <Tooltip.Popup>{label}</Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function ActionsGroup() {
  const [saved, setSaved] = useState(false);
  const [cadence, setCadence] = useState(["instant"]);

  return (
    <Group id="actions" title="Actions">
      <Specimen name="Button" use="Apply and Tailor lead a job. Secondary actions sit beside them, rare ones stay quiet.">
        <Row>
          <Button variant="primary">Apply</Button>
          <Button>Tailor resume</Button>
          <Button variant="ghost">Dismiss</Button>
          <Button variant="danger">Delete account</Button>
        </Row>
        <Row>
          <Button variant="primary" size="sm">Save search</Button>
          <Button variant="primary">Save search</Button>
          <Button variant="primary" size="lg">Save search</Button>
        </Row>
        <Row>
          <IconButton label="Save job"><BookmarkIcon /></IconButton>
          <IconButton label="Share"><ShareIcon /></IconButton>
          <IconButton label="More"><MoreIcon /></IconButton>
          <Button variant="primary" disabled focusableWhenDisabled>
            Applying…
          </Button>
        </Row>
      </Specimen>

      <Specimen name="Toggle" use="An on/off action that stays pressed, like saving a job.">
        <Row>
          <Toggle pressed={saved} onPressedChange={setSaved} aria-label="Save job">
            <BookmarkIcon />
            {saved ? "Saved" : "Save"}
          </Toggle>
        </Row>
      </Specimen>

      <Specimen name="Toggle Group" use="A segmented control for one choice among a few, shown side by side.">
        <Segmented value={cadence} onValueChange={setCadence} aria-label="Alert speed" className="w-full max-w-90">
          <Segment value="instant">Instant</Segment>
          <Segment value="hourly">Hourly</Segment>
          <Segment value="daily">Daily</Segment>
        </Segmented>
      </Specimen>

      <Specimen name="Toolbar" use="The action row on a job's detail screen, reachable with arrow keys.">
        <Toolbar.Root aria-label="Job actions">
          <Toolbar.Group>
            <Toolbar.Button render={<BaseToggle />} aria-label="Save job">
              <BookmarkIcon size={14} />
              Save
            </Toolbar.Button>
            <Toolbar.Button>
              <ShareIcon size={14} />
              Share
            </Toolbar.Button>
          </Toolbar.Group>
          <Toolbar.Separator />
          <Toolbar.Button>Mark applied</Toolbar.Button>
          <Toolbar.Button aria-label="More">
            <MoreIcon size={14} />
          </Toolbar.Button>
        </Toolbar.Root>
      </Specimen>
    </Group>
  );
}
