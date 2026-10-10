import { BookmarkSimple, Briefcase, Flag, Plus, Trash } from "phosphor-react-native";
import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import {
  Badge, Button, Checkbox, EmptyState, Field, Heading, Icon, IconButton, Inline, Input, ListRow, ListSection, Menu,
  MultiToggleGroup, Screen, SegmentedControl, Separator, Skeleton, Spinner, Stack, Surface, Switch, Text, Textarea, toast,
  ToggleGroup,
} from "../../kit";

/** Dev-only: every native kit component in its states (the web's /_kit). */
export function KitGallery() {
  const [on, setOn] = useState(true);
  const [checked, setChecked] = useState(false);
  const [segment, setSegment] = useState<"saved" | "applied">("saved");
  const [stage, setStage] = useState<"intern" | "new_grad" | undefined>("new_grad");
  const [modes, setModes] = useState<("remote" | "hybrid" | "onsite")[]>(["remote"]);
  return <Screen>
    <Section title="Type">
      <Heading variant="display-lg">Display large</Heading>
      <Heading variant="display-md">Display medium</Heading>
      <Heading variant="display-sm">Display small</Heading>
      <Heading>Section</Heading>
      <Text>Body text on ink</Text>
      <Text tone="ink-2">Ink 2</Text><Text tone="ink-3">Ink 3</Text><Text tone="ink-4">Ink 4</Text>
      <Inline gap="3"><Text tone="accent">Accent</Text><Text tone="good">Good</Text><Text tone="warn">Warn</Text><Text tone="bad">Bad</Text></Inline>
      <Inline gap="2"><Badge>New</Badge><Badge>Closed</Badge></Inline>
    </Section>
    <Section title="Actions">
      <Button onPress={() => router.push("/you/kit-swipes")}>Swipes</Button>
      <Button variant="primary" icon={Briefcase}>Apply</Button>
      <Button icon={BookmarkSimple}>Save</Button>
      <Button variant="danger" icon={Trash}>Delete</Button>
      <Inline gap="2"><Button size="compact" icon={Plus}>Compact</Button><Button size="compact" pending>Saving</Button><Button size="compact" disabled>Disabled</Button></Inline>
      <Inline gap="1"><IconButton icon={BookmarkSimple} label="Save" /><IconButton icon={BookmarkSimple} label="Saved" pressed /><IconButton icon={Flag} label="Report" size="sm" /></Inline>
      <Menu items={[{ id: "share", title: "Share", icon: "square.and.arrow.up", onSelect: () => toast.show({ message: "Share" }) },
        { id: "hide", title: "Hide", icon: "eye.slash", destructive: true, onSelect: () => toast.show({ message: "Hidden", action: { label: "Undo", run: () => undefined } }) }]}>
        <Button size="compact">Open menu</Button>
      </Menu>
      <Inline gap="2">
        <Button size="compact" onPress={() => toast.success("Saved")}>Toast</Button>
        <Button size="compact" onPress={() => toast.error("Couldn't save. Try again.")}>Error toast</Button>
      </Inline>
    </Section>
    <Section title="Inputs">
      <Field label="Name"><Input placeholder="Avery" /></Field>
      <Field label="Email" error="Enter a valid email address."><Input invalid defaultValue="avery@" /></Field>
      <Field label="Notes" optional><Textarea /></Field>
      <Inline justify="between"><Text>Job alerts</Text><Switch label="Job alerts" checked={on} onCheckedChange={setOn} /></Inline>
      <Checkbox label="Include remote" checked={checked} onCheckedChange={setChecked} />
      <SegmentedControl segments={[{ value: "saved", label: "Saved" }, { value: "applied", label: "Applied" }]} value={segment} onValueChange={setSegment} />
      <ToggleGroup label="Stage" value={stage} onValueChange={setStage} onClear={() => setStage(undefined)}
        options={[{ value: "intern", label: "Internships" }, { value: "new_grad", label: "New grad" }]} />
      <MultiToggleGroup label="Work mode" value={modes} onValueChange={setModes} min={1}
        options={[{ value: "remote", label: "Remote" }, { value: "hybrid", label: "Hybrid" }, { value: "onsite", label: "Onsite" }]} />
    </Section>
    <Section title="Surfaces">
      <ListSection label="Group">
        <ListRow title="Job preferences" detail="All career stages" icon={Briefcase} onPress={() => undefined} />
        <ListRow title="Static row" detail="No action" />
        <ListRow title="Log out" destructive onPress={() => undefined} />
      </ListSection>
      <Surface><Stack gap="2"><Text weight="medium">Card</Text><Separator /><Text tone="ink-3">On the elevated background</Text></Stack></Surface>
      <Stack gap="2"><Skeleton width="80%" /><Skeleton width="60%" /><Spinner /></Stack>
      <View><EmptyState icon={BookmarkSimple} title="No saved jobs" message="Save promising roles and they'll stay here."
        actions={<Button size="compact">Browse jobs</Button>} /></View>
      <Inline gap="2"><Icon icon={Briefcase} /><Icon icon={Briefcase} tone="accent" weight="fill" size={24} /></Inline>
    </Section>
  </Screen>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <Stack gap="3"><Text size="xs" weight="semibold" tone="ink-4">{title.toUpperCase()}</Text>{children}</Stack>;
}
