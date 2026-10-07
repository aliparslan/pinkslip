import { Button } from "@pinkslip/ui/button";
import { Tabs } from "@pinkslip/ui/disclosure";
import { Separator } from "@pinkslip/ui/display";
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, MoreIcon } from "@pinkslip/ui/icons";
import { ContextMenu, Menu, Menubar, MenubarTrigger, menuItemDanger } from "@pinkslip/ui/menu";
import { NavigationMenu } from "@pinkslip/ui/navigation-menu";
import { useState } from "react";
import { exampleJobs } from "../data";
import { Group, JobRow, Specimen } from "../specimen";

function Shortcut({ keys }: { keys: string }) {
  return <span className="ml-auto pl-6 text-meta tabular-nums text-ink-3">{keys}</span>;
}

export function MenusGroup() {
  const [muted, setMuted] = useState(false);
  const [theme, setTheme] = useState("system");
  const [salaries, setSalaries] = useState(true);
  const ramp = exampleJobs[0]!;

  return (
    <Group id="menus" title="Menus and navigation">
      <Specimen name="Menu" use="Less common actions on a job, behind More.">
        <Menu.Root>
          <Menu.Trigger render={<Button size="icon" variant="ghost" aria-label="More actions" />}>
            <MoreIcon />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner sideOffset={6} align="start">
              <Menu.Popup>
                <Menu.Item>Mark applied</Menu.Item>
                <Menu.Item>Copy link</Menu.Item>
                <Menu.SubmenuRoot>
                  <Menu.SubmenuTrigger>
                    Hide
                    <ChevronRightIcon size={14} className="text-ink-3" />
                  </Menu.SubmenuTrigger>
                  <Menu.Portal>
                    <Menu.Positioner sideOffset={-4} alignOffset={-4}>
                      <Menu.Popup>
                        <Menu.Item>This job</Menu.Item>
                        <Menu.Item>All jobs from Ramp</Menu.Item>
                      </Menu.Popup>
                    </Menu.Positioner>
                  </Menu.Portal>
                </Menu.SubmenuRoot>
                <Menu.Separator />
                <Menu.CheckboxItem checked={muted} onCheckedChange={setMuted}>
                  <Menu.CheckboxItemIndicator>
                    <CheckIcon size={14} />
                  </Menu.CheckboxItemIndicator>
                  <span className="col-start-2">Mute alerts from Ramp</span>
                </Menu.CheckboxItem>
                <Menu.Separator />
                <Menu.Item className={menuItemDanger}>Report posting</Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </Specimen>

      <Specimen name="Context Menu" use="The same actions on a feed row, by right-click or long-press.">
        <ContextMenu.Root>
          <ContextMenu.Trigger className="max-w-110 select-none rounded-control border border-dashed border-line-2 px-3">
            <JobRow job={ramp} />
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Positioner>
              <ContextMenu.Popup>
                <ContextMenu.Item>Save</ContextMenu.Item>
                <ContextMenu.Item>Mark applied</ContextMenu.Item>
                <ContextMenu.Item>Open original posting</ContextMenu.Item>
                <ContextMenu.Separator />
                <ContextMenu.Item className={menuItemDanger}>Hide Ramp</ContextMenu.Item>
              </ContextMenu.Popup>
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        </ContextMenu.Root>
        <p className="text-meta text-ink-3">Right-click or long-press the job above.</p>
      </Specimen>

      <Specimen name="Menubar" use="Desktop-only command menus for the wide web layout.">
        <Menubar>
          <Menu.Root>
            <MenubarTrigger>Jobs</MenubarTrigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={6} align="start">
                <Menu.Popup>
                  <Menu.Item>
                    Refresh feed
                    <Shortcut keys="R" />
                  </Menu.Item>
                  <Menu.Item>
                    Search
                    <Shortcut keys="/" />
                  </Menu.Item>
                  <Menu.Separator />
                  <Menu.Item>Export saved jobs</Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
          <Menu.Root>
            <MenubarTrigger>View</MenubarTrigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={6} align="start">
                <Menu.Popup>
                  <Menu.GroupLabel>Theme</Menu.GroupLabel>
                  <Menu.RadioGroup value={theme} onValueChange={setTheme}>
                    {["system", "light", "dark"].map((option) => (
                      <Menu.RadioItem key={option} value={option}>
                        <Menu.RadioItemIndicator>
                          <CheckIcon size={14} />
                        </Menu.RadioItemIndicator>
                        <span className="col-start-2 capitalize">{option}</span>
                      </Menu.RadioItem>
                    ))}
                  </Menu.RadioGroup>
                  <Menu.Separator />
                  <Menu.CheckboxItem checked={salaries} onCheckedChange={setSalaries}>
                    <Menu.CheckboxItemIndicator>
                      <CheckIcon size={14} />
                    </Menu.CheckboxItemIndicator>
                    <span className="col-start-2">Show salaries</span>
                  </Menu.CheckboxItem>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
          <Menu.Root>
            <MenubarTrigger>Account</MenubarTrigger>
            <Menu.Portal>
              <Menu.Positioner sideOffset={6} align="start">
                <Menu.Popup>
                  <Menu.Item>Resume profile</Menu.Item>
                  <Menu.Item>Notifications</Menu.Item>
                  <Menu.Separator />
                  <Menu.Item>Sign out</Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </Menubar>
      </Specimen>

      <Specimen name="Navigation Menu" use="Navigation for the public site. The panel reshapes as you move between items.">
        <NavigationMenu.Root>
          <NavigationMenu.List>
            <NavigationMenu.Item>
              <NavigationMenu.Trigger>
                Product
                <NavigationMenu.Icon>
                  <ChevronDownIcon size={12} />
                </NavigationMenu.Icon>
              </NavigationMenu.Trigger>
              <NavigationMenu.Content>
                <ul className="grid gap-1">
                  {[
                    ["Alerts", "Know within minutes of a new posting."],
                    ["Tailoring", "A resume fitted to each role, from your master story."],
                    ["Auto-apply", "Applications filled in for you to review and send."],
                  ].map(([title, text]) => (
                    <li key={title}>
                      <NavigationMenu.Link href="#menus">
                        <span className="text-ui font-medium">{title}</span>
                        <span className="text-meta text-ink-3">{text}</span>
                      </NavigationMenu.Link>
                    </li>
                  ))}
                </ul>
              </NavigationMenu.Content>
            </NavigationMenu.Item>
            <NavigationMenu.Item>
              <NavigationMenu.Trigger>
                Companies
                <NavigationMenu.Icon>
                  <ChevronDownIcon size={12} />
                </NavigationMenu.Icon>
              </NavigationMenu.Trigger>
              <NavigationMenu.Content>
                <ul className="grid grid-cols-2 gap-1">
                  {["Greenhouse", "Lever", "Ashby", "Workday"].map((source) => (
                    <li key={source}>
                      <NavigationMenu.Link href="#menus">
                        <span className="text-ui font-medium">{source}</span>
                        <span className="text-meta text-ink-3">Checked every few minutes</span>
                      </NavigationMenu.Link>
                    </li>
                  ))}
                </ul>
              </NavigationMenu.Content>
            </NavigationMenu.Item>
            <NavigationMenu.Item>
              <NavigationMenu.Link href="#menus" className="h-control-sm justify-center px-3 py-0 text-meta font-medium text-ink-2">
                Pricing
              </NavigationMenu.Link>
            </NavigationMenu.Item>
          </NavigationMenu.List>
          <NavigationMenu.Portal>
            <NavigationMenu.Positioner sideOffset={8} align="start">
              <NavigationMenu.Popup>
                <NavigationMenu.Viewport />
              </NavigationMenu.Popup>
            </NavigationMenu.Positioner>
          </NavigationMenu.Portal>
        </NavigationMenu.Root>
      </Specimen>

      <Specimen name="Tabs" use="Sibling views within one screen, like the two halves of your Library.">
        <Tabs.Root defaultValue="saved" className="max-w-110">
          <Tabs.List>
            <Tabs.Tab value="saved">
              Saved <span className="tabular-nums text-ink-3">3</span>
            </Tabs.Tab>
            <Tabs.Tab value="applied">
              Applied <span className="tabular-nums text-ink-3">2</span>
            </Tabs.Tab>
            <Tabs.Indicator />
          </Tabs.List>
          <Tabs.Panel value="saved">
            {exampleJobs.slice(0, 3).map((job, index) => (
              <div key={job.id}>
                {index > 0 ? <Separator /> : null}
                <JobRow job={job} />
              </div>
            ))}
          </Tabs.Panel>
          <Tabs.Panel value="applied">
            {exampleJobs.slice(3).map((job, index) => (
              <div key={job.id}>
                {index > 0 ? <Separator /> : null}
                <JobRow job={job} />
              </div>
            ))}
          </Tabs.Panel>
        </Tabs.Root>
      </Specimen>
    </Group>
  );
}
