import { Button } from "@pinkslip/ui/button";
import { ChoiceLabel, Radio, RadioGroup, Switch } from "@pinkslip/ui/choice";
import { Popover, PreviewCard } from "@pinkslip/ui/floating";
import { AlertDialog, Dialog, DialogActions, Drawer, DrawerHandle } from "@pinkslip/ui/overlay";
import { BookmarkIcon, MoreIcon, ShareIcon, SlidersIcon } from "@pinkslip/ui/icons";
import { Segment, Segmented } from "@pinkslip/ui/toggle";
import { useState } from "react";
import { IconButton } from "./actions";
import { CompanyMark } from "../../components/company-mark";
import { Group, Row, Specimen } from "../specimen";

const reasons = [
  { value: "filled", label: "Closed or already filled" },
  { value: "level", label: "Needs more than three years" },
  { value: "location", label: "Wrong location" },
  { value: "scam", label: "Looks like a scam" },
];

export function OverlaysGroup() {
  const [mode, setMode] = useState(["any"]);

  return (
    <Group id="overlays" title="Overlays">
      <Specimen name="Dialog" use="A focused task on top of the page, like reporting a bad posting.">
        <Dialog.Root>
          <Dialog.Trigger render={<Button />}>Report posting</Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Backdrop />
            <Dialog.Popup>
              <Dialog.Title>Report this posting</Dialog.Title>
              <Dialog.Description>Reports hide the job for you and flag it for review.</Dialog.Description>
              <RadioGroup defaultValue="filled" aria-label="Reason" className="mt-4">
                {reasons.map((reason) => (
                  <ChoiceLabel key={reason.value} control={<Radio value={reason.value} />} label={reason.label} />
                ))}
              </RadioGroup>
              <DialogActions>
                <Dialog.Close render={<Button variant="ghost" />}>Cancel</Dialog.Close>
                <Dialog.Close render={<Button variant="primary" />}>Send report</Dialog.Close>
              </DialogActions>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      </Specimen>

      <Specimen name="Alert Dialog" use="Confirms a change that is hard to undo. It does not close on an outside tap.">
        <AlertDialog.Root>
          <AlertDialog.Trigger render={<Button variant="ghost" />}>Remove from Applied</AlertDialog.Trigger>
          <AlertDialog.Portal>
            <AlertDialog.Backdrop />
            <AlertDialog.Popup>
              <AlertDialog.Title>Remove from Applied?</AlertDialog.Title>
              <AlertDialog.Description>
                Software Engineer, New Grad at Ramp goes back to your feed. Your notes stay with the job.
              </AlertDialog.Description>
              <DialogActions>
                <AlertDialog.Close render={<Button variant="ghost" />}>Keep it</AlertDialog.Close>
                <AlertDialog.Close render={<Button variant="danger" />}>Remove</AlertDialog.Close>
              </DialogActions>
            </AlertDialog.Popup>
          </AlertDialog.Portal>
        </AlertDialog.Root>
      </Specimen>

      <Specimen name="Drawer" use="A bottom sheet for phone-sized tasks like feed filters. Swipe down to close.">
        <Drawer.Root>
          <Drawer.Trigger render={<Button />}>
            <SlidersIcon size={14} />
            Filters
          </Drawer.Trigger>
          <Drawer.Portal>
            <Drawer.Backdrop />
            <Drawer.Viewport>
              <Drawer.Popup>
                <DrawerHandle />
                <Drawer.Content>
                  <Drawer.Title>Filters</Drawer.Title>
                  <Drawer.Description>Narrow the feed. Alerts follow your saved search, not these.</Drawer.Description>
                  <div className="mt-5 flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                      <span className="text-ui font-medium text-ink">Work mode</span>
                      <Segmented value={mode} onValueChange={setMode} aria-label="Work mode" className="w-full">
                        <Segment value="any">Any</Segment>
                        <Segment value="remote">Remote</Segment>
                        <Segment value="hybrid">Hybrid</Segment>
                        <Segment value="onsite">On-site</Segment>
                      </Segmented>
                    </div>
                    <label htmlFor="filter-salary" className="flex cursor-pointer items-center justify-between gap-4">
                      <span className="text-ui text-ink">Only jobs that list salary</span>
                      <Switch id="filter-salary" />
                    </label>
                    <label htmlFor="filter-saved" className="flex cursor-pointer items-center justify-between gap-4">
                      <span className="text-ui text-ink">Hide jobs I've saved</span>
                      <Switch id="filter-saved" defaultChecked />
                    </label>
                    <div className="flex gap-2 pt-2">
                      <Drawer.Close render={<Button className="flex-1" />}>Reset</Drawer.Close>
                      <Drawer.Close render={<Button variant="primary" className="flex-1" />}>Show 214 jobs</Drawer.Close>
                    </div>
                  </div>
                </Drawer.Content>
              </Drawer.Popup>
            </Drawer.Viewport>
          </Drawer.Portal>
        </Drawer.Root>
      </Specimen>

      <Specimen name="Popover" use="Detail on demand. Here, how fast this job reached you.">
        <Popover.Root>
          <Popover.Trigger render={<Button variant="ghost" size="sm" />}>Posted 4 minutes ago</Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner sideOffset={8} align="start">
              <Popover.Popup>
                <Popover.Title>Timing</Popover.Title>
                <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-meta">
                  <dt className="text-ink-2">Posted on Ashby</dt>
                  <dd className="tabular-nums text-ink">10:58 AM</dd>
                  <dt className="text-ink-2">Found by Pinkslip</dt>
                  <dd className="tabular-nums text-ink">11:01 AM</dd>
                  <dt className="text-ink-2">Alert sent to you</dt>
                  <dd className="tabular-nums text-ink">11:01 AM</dd>
                </dl>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </Specimen>

      <Specimen name="Tooltip" use="Names an icon-only control. Shows on hover and keyboard focus, not on touch.">
        <Row>
          <IconButton label="Save job"><BookmarkIcon /></IconButton>
          <IconButton label="Share"><ShareIcon /></IconButton>
          <IconButton label="More"><MoreIcon /></IconButton>
        </Row>
      </Specimen>

      <Specimen name="Preview Card" use="A peek at a company from anywhere its name appears.">
        <p className="text-body text-ink-2">
          New role at{" "}
          <PreviewCard.Root>
            <PreviewCard.Trigger href="#display" className="font-medium text-ink underline decoration-line-2 underline-offset-4 hover:decoration-accent">
              Ramp
            </PreviewCard.Trigger>
            <PreviewCard.Portal>
              <PreviewCard.Positioner sideOffset={8}>
                <PreviewCard.Popup>
                  <div className="flex items-center gap-3">
                    <CompanyMark name="Ramp" />
                    <div className="flex flex-col">
                      <span className="text-ui font-medium text-ink">Ramp</span>
                      <span className="text-meta text-ink-3">Finance automation, New York</span>
                    </div>
                  </div>
                  <p className="mt-3 text-meta tabular-nums text-ink-2">38 open roles, 6 for new grads. Hires through Ashby.</p>
                </PreviewCard.Popup>
              </PreviewCard.Positioner>
            </PreviewCard.Portal>
          </PreviewCard.Root>
          , posted 4 minutes ago.
        </p>
      </Specimen>
    </Group>
  );
}
