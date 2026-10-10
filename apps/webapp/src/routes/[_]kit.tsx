import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowSquareOut, Bell, BookmarkSimple, Buildings, CaretRight, DotsThree, MagnifyingGlass, PaperPlaneTilt, X,
} from "@phosphor-icons/react";
import {
  Alert, Badge, Button, Checkbox, Field, Fieldset, Form, Heading, Icon, IconButton, Inline, Input, LinkButton,
  SaveStatus, Select, SelectCheck, Separator, Skeleton, Spinner, Stack, Surface, Switch, Text, Textarea,
  ToggleGroup, VisuallyHidden, type ButtonVariant, type IconSize, type SavePhase, type TextTone,
} from "../kit";
import styles from "../styles/Kit.module.css";

/** Development-only catalog of every kit component and state. Phase 2.4
 * screenshots this page in each theme and width. */
export const Route = createFileRoute("/_kit")({
  ssr: false,
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({ meta: [{ title: "Kit · Pinkslip" }] }),
  component: Kit,
});

type Mode = "dark" | "light";

function Kit() {
  const [mode, setMode] = useState<Mode>("dark");
  const [contrast, setContrast] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.mode = mode;
    if (contrast) document.documentElement.dataset.iosContrast = "more";
    else delete document.documentElement.dataset.iosContrast;
  }, [mode, contrast]);

  return <Stack gap="10">
    <Stack gap="2">
      <Heading level={1} variant="root">Kit</Heading>
      <Text tone="ink-3">Every kit component in each state. Development only.</Text>
      <Inline gap="4" wrap>
        <label className={styles.control}>
          Mode
          <select value={mode} onChange={(event) => setMode(event.target.value as Mode)}>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label className={styles.control}>
          <input type="checkbox" checked={contrast} onChange={(event) => setContrast(event.target.checked)} />
          Increased contrast
        </label>
      </Inline>
    </Stack>

    <Section title="Headings">
      <Heading level={2} variant="root">Jobs</Heading>
      <Heading level={2} variant="screen">Job preferences</Heading>
      <Heading level={2} variant="display-lg">Display large</Heading>
      <Heading level={2} variant="display-md">Frontend Engineer, New Grad</Heading>
      <Heading level={2} variant="display-sm">No saved jobs yet</Heading>
      <Heading level={2} variant="section">Search</Heading>
    </Section>

    <Section title="Text">
      {(["lg", "md", "sm", "xs", "2xs"] as const).map((size) =>
        <Text key={size} size={size}>Size {size}: early-career roles from company career pages</Text>)}
      <Separator />
      {(["ink", "ink-2", "ink-3", "ink-4", "accent", "good", "warn", "bad"] satisfies TextTone[]).map((tone) =>
        <Text key={tone} tone={tone}>Tone {tone}</Text>)}
      <Separator />
      <Text weight="regular">Regular 400</Text>
      <Text weight="medium">Medium 500</Text>
      <Text weight="semibold">Semibold 600</Text>
      <Text size="xs" weight="semibold" tone="ink-4">Section label role</Text>
      <Text size="sm" weight="medium" tone="ink-2">Field label role</Text>
      <div className={styles.narrow}>
        <Text truncate>Truncated: Senior Staff Software Engineer, Distributed Systems Infrastructure</Text>
      </div>
      <Text tabular>Tabular digits: 1,234 jobs · 98 saved</Text>
    </Section>

    <Section title="Icons">
      <Inline gap="4" wrap>
        {([13, 14, 16, 18, 20, 22, 24] satisfies IconSize[]).map((size) =>
          <Icon key={size} icon={Bell} size={size} weight="bold" />)}
      </Inline>
      <Inline gap="4">
        <Icon icon={BookmarkSimple} size={20} weight="regular" />
        <Icon icon={BookmarkSimple} size={20} weight="bold" />
        <Icon icon={BookmarkSimple} size={20} weight="fill" label="Saved" />
        <Text as="span" tone="accent"><Icon icon={MagnifyingGlass} size={18} weight="bold" /></Text>
      </Inline>
    </Section>

    <Section title="Layout">
      <Inline justify="between">
        <Text>Split row (justify between)</Text>
        <Icon icon={CaretRight} size={16} weight="bold" />
      </Inline>
      <Inline gap="2" wrap>
        {["Internship", "New grad", "Early career", "Remote", "Hybrid", "On-site"].map((label) =>
          <Badge key={label}>{label}</Badge>)}
      </Inline>
      <Stack gap="2">
        <Text size="sm" tone="ink-3">Stack gap 2</Text>
        <Text size="sm" tone="ink-3">Stack gap 2</Text>
      </Stack>
    </Section>

    <Section title="Surfaces">
      <Surface variant="list" bleedOnPhone as="ul">
        {[["Job preferences", "Software engineering · New York"], ["Job alerts", "Daily digest"], ["Companies", "48 followed"]].map(([title, detail], index) =>
          <li key={title}>
            {index > 0 && <Separator />}
            <Inline justify="between" className={styles.row}>
              <Inline gap="3">
                <Icon icon={Buildings} size={20} weight="bold" />
                <Stack gap="1">
                  <Text weight="medium">{title}</Text>
                  <Text size="sm" tone="ink-3">{detail}</Text>
                </Stack>
              </Inline>
              <Text as="span" tone="ink-4"><Icon icon={CaretRight} size={16} weight="bold" /></Text>
            </Inline>
          </li>)}
      </Surface>
      <Surface variant="card">
        <Stack gap="2">
          <Heading level={3} variant="section">Card</Heading>
          <Text tone="ink-2">Padded content card for forms and summaries.</Text>
        </Stack>
      </Surface>
    </Section>

    <Section title="Loading">
      <Inline gap="4">
        <Spinner size={14} />
        <Spinner size={16} />
        <Spinner size={20} />
        <Text as="span" tone="ink-3"><Spinner size={28} label="Loading jobs" /></Text>
      </Inline>
      <Stack gap="2">
        <Skeleton width="40%" height="var(--fs-sm)" />
        <Skeleton width="80%" height="var(--fs-md)" />
        <Skeleton width="60%" height="var(--fs-sm)" />
      </Stack>
    </Section>

    <Actions />
    <Inputs />
    <Choices />

    <Section title="Assistive text">
      <Text>Visible text<VisuallyHidden> with a hidden suffix for screen readers</VisuallyHidden>.</Text>
    </Section>
  </Stack>;
}

const buttonVariants: ButtonVariant[] = ["accent", "primary", "secondary", "danger"];

function Actions() {
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  return <Section title="Actions">
    <Inline gap="2" wrap>
      {buttonVariants.map((variant) => <Button key={variant} variant={variant}>{variant}</Button>)}
    </Inline>
    <Inline gap="2" wrap>
      {buttonVariants.map((variant) => <Button key={variant} variant={variant} size="compact">{variant}</Button>)}
    </Inline>
    <Inline gap="2" wrap>
      <Button variant="accent" icon={PaperPlaneTilt}>Send email</Button>
      <Button variant="secondary" disabled>Disabled</Button>
      <Button variant="accent" pending={pending} onClick={() => {
        setPending(true);
        window.setTimeout(() => setPending(false), 1500);
      }}>{pending ? "Saving…" : "Save (pending 1.5s)"}</Button>
      <LinkButton to="/" icon={ArrowSquareOut}>Link button</LinkButton>
    </Inline>
    <Button variant="secondary" size="compact" fullWidth>Full-width compact (.btn-action)</Button>
    <Inline gap="2">
      <IconButton icon={DotsThree} label="More" />
      <IconButton icon={BookmarkSimple} label="Save job" pressed={saved} onClick={() => setSaved(!saved)} />
      <IconButton icon={X} label="Close" surface />
      <IconButton icon={DotsThree} label="More (small)" size="sm" />
      <IconButton icon={X} label="Remove (extra small)" size="xs" />
      <IconButton icon={Bell} label="Disabled" disabled />
    </Inline>
  </Section>;
}

function Inputs() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [education, setEducation] = useState("bachelors");
  return <Section title="Inputs">
    <Form aria-label="Kit form" onSubmit={() => setSubmitted(email.includes("@") ? null : "Enter a valid email address.")}>
      <Field label="Email" error={submitted}>
        <Input type="email" placeholder="you@school.edu" value={email} onChange={(event) => setEmail(event.target.value)} />
      </Field>
      <Field label="Portfolio" optional>
        <Input type="url" placeholder="https://" />
      </Field>
      <Field label="Years of experience">
        <Input type="number" min={0} max={40} step={1} defaultValue={0} />
      </Field>
      <Field label="Highest completed education">
        <Select value={education} onChange={(event) => setEducation(event.target.value)}>
          <option value="high_school">High school</option>
          <option value="bachelors">Bachelor's</option>
          <option value="masters">Master's</option>
          <option value="doctorate">Doctorate</option>
        </Select>
      </Field>
      <Field label="Cover note" optional>
        <Textarea placeholder="A few lines about why this role" />
      </Field>
      <Field label="Disabled" disabled>
        <Input defaultValue="Can't edit this" />
      </Field>
      <Inline gap="2">
        <Button type="submit" variant="accent">Submit (empty email shows the error)</Button>
      </Inline>
    </Form>
    <Fieldset legend="Fieldset legend">
      <Field label="First name"><Input autoComplete="given-name" /></Field>
      <Field label="Last name"><Input autoComplete="family-name" /></Field>
    </Fieldset>
    <Alert tone="error">Couldn't save your changes. Try again.</Alert>
    <Alert tone="success">Resume uploaded.</Alert>
    <Alert tone="warn">Your session expires soon.</Alert>
  </Section>;
}

const feedFilters = ["All", "Saved", "Applied", "Hidden"] as const;
const phases: SavePhase[] = ["clean", "dirty", "saving", "saved", "error"];

function Choices() {
  const [filter, setFilter] = useState<(typeof feedFilters)[number]>("All");
  const [view, setView] = useState<"open" | "reviewed">("open");
  const [current, setCurrent] = useState(true);
  const [anywhere, setAnywhere] = useState(false);
  const [alerts, setAlerts] = useState(true);
  const [phase, setPhase] = useState<SavePhase>("saved");
  return <Section title="Choices">
    <ToggleGroup label="Feed filter" value={filter} onValueChange={setFilter}
      options={feedFilters.map((value) => ({ value, label: value }))} />
    <ToggleGroup label="Disagreement filter" variant="segmented" value={view} onValueChange={setView}
      options={[{ value: "open", label: "To review 4" }, { value: "reviewed", label: "Reviewed 12" }]} />
    <Inline gap="4" wrap>
      <Checkbox checked={current} onCheckedChange={setCurrent}>Current role</Checkbox>
      <Checkbox checked={false} onCheckedChange={() => {}} disabled>Disabled</Checkbox>
      <Inline gap="2"><SelectCheck checked /><SelectCheck checked={false} /><Text as="span" size="sm" tone="ink-3">Menu check boxes</Text></Inline>
    </Inline>
    <Inline justify="between">
      <Text>Open to anywhere</Text>
      <Switch label="Open to anywhere" checked={anywhere} onCheckedChange={setAnywhere} />
    </Inline>
    <Inline justify="between">
      <Text>Job alerts (accent on phones)</Text>
      <Switch label="Job alerts" tone="accent" checked={alerts} onCheckedChange={setAlerts} />
    </Inline>
    <Inline justify="between">
      <Text tone="ink-3">Disabled</Text>
      <Switch label="Disabled switch" checked disabled onCheckedChange={() => {}} />
    </Inline>
    <Inline gap="4" wrap>
      <ToggleGroup label="Save phase" variant="segmented" value={phase} onValueChange={setPhase}
        options={phases.map((value) => ({ value, label: value }))} />
      <SaveStatus phase={phase} errorMessage="Network error" onRetry={() => setPhase("saving")} />
      <SaveStatus phase={phase} compact />
    </Inline>
  </Section>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Stack as="section" gap="4">
    <Text size="xs" weight="semibold" tone="ink-4">{title}</Text>
    <Stack gap="3">{children}</Stack>
  </Stack>;
}
