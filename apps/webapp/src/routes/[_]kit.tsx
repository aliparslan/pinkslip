import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowSquareOut, BookmarksSimple, Bell, BookmarkSimple, Buildings, CaretRight, CheckCircle, DotsThree, DotsThreeVertical, EyeSlash,
  MagnifyingGlass, PaperPlaneTilt, Trash, WifiSlash, X,
} from "@phosphor-icons/react";
import {
  Alert, AlertDialog, Badge, Button, Checkbox, Dialog, Disclosure, EmptyState, Field, Fieldset, Form, Heading, Icon, IconButton,
  Inline, Input, Menu, MultiToggleGroup, SearchInput, MenuCheckboxItem, MenuItem, MenuSeparator, Progress, SaveStatus, Select,
  SelectCheck, Separator, Sheet, Skeleton, Spinner, Stack, Surface, Switch, TabPanel, Tabs, Text, Textarea, toast,
  ToggleGroup, Tooltip, InfoTip, Popover, UNDO_TOAST_DURATION, VisuallyHidden, type ButtonVariant, type IconSize, type SavePhase, type TextTone,
} from "../kit";
import styles from "../styles/Kit.module.css";
import { LinkButton } from "../features/navigation/LinkButton";
import { InlineFailure, PageFailure, PageLoading } from "../features/states/LoadStates";
import { JobList } from "../features/jobs/JobList";
import { demoJobs } from "../features/jobs/demo-jobs";

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
    <Overlays />
    <Hints />
    <Feedback />
    <Disclosures />

    <Section title="Job rows">
      <div className={styles.bleed}>
        <JobList jobs={demoJobs(4)} viewed={new Set(["demo-3"])} label="Demo jobs" actions={{
          onSave: () => toast.success("Job saved"),
          onToggleRead: () => undefined,
          onHide: () => toast.success("Job hidden (demo)"),
        }} />
      </div>
      <Text size="sm" tone="ink-3">300 virtualized rows: /_kit-list.</Text>
    </Section>

    <Section title="Empty and failure states">
      <Surface variant="card">
        <EmptyState icon={BookmarksSimple} title="No saved jobs yet" message="Save jobs from the feed to keep them here."
          actions={<LinkButton to="/" variant="primary">Browse jobs</LinkButton>} />
      </Surface>
      <Surface variant="list">
        <EmptyState compact title="No matches" message="Try fewer filters." />
      </Surface>
      <InlineFailure onRetry={() => toast.success("Retrying (demo)")} />
      <Surface variant="card">
        <PageFailure onRetry={() => toast.success("Retrying (demo)")} />
      </Surface>
      <Surface variant="card"><PageLoading /></Surface>
      <Text size="sm" tone="ink-3">Page-level states: open /does-not-exist (404) or /_kit-error (route error with retry).</Text>
    </Section>

    <Section title="Assistive text">
      <Text>Visible text<VisuallyHidden> with a hidden suffix for screen readers</VisuallyHidden>.</Text>
    </Section>
  </Stack>;
}

const buttonVariants: ButtonVariant[] = ["primary", "secondary", "danger"];

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
      <Button variant="primary" icon={PaperPlaneTilt}>Send email</Button>
      <Button variant="secondary" disabled>Disabled</Button>
      <Button variant="primary" pending={pending} onClick={() => {
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
    <SearchInput aria-label="Search jobs or companies" placeholder="Search" />
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
        <Button type="submit" variant="primary">Submit (empty email shows the error)</Button>
      </Inline>
    </Form>
    <Fieldset legend="Fieldset legend">
      <Field label="First name"><Input autoComplete="given-name" /></Field>
      <Field label="Last name"><Input autoComplete="family-name" /></Field>
    </Fieldset>
    <Alert tone="error">Couldn't save your changes. Try again.</Alert>
    <Alert tone="success">Resume uploaded.</Alert>
    <Alert tone="warning">Your session expires soon.</Alert>
    <Alert tone="warning" size="compact" icon={WifiSlash}>You're offline. Changes and new results return when you're back online.</Alert>
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
  const [stages, setStages] = useState<string[]>(["internship", "new_grad"]);
  const [relocate, setRelocate] = useState<"yes" | "no" | undefined>(undefined);
  return <Section title="Choices">
    <ToggleGroup label="Open to relocation (tap again to clear)" value={relocate} onValueChange={setRelocate} onClear={() => setRelocate(undefined)}
      options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]} />
    <MultiToggleGroup label="Career stage" value={stages} onValueChange={setStages} min={1}
      options={[{ value: "internship", label: "Internships" }, { value: "new_grad", label: "New grad" }, { value: "early_career", label: "Early career" }]} />
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
      <Text>Job alerts</Text>
      <Switch label="Job alerts" checked={alerts} onCheckedChange={setAlerts} />
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

const workModes = ["Remote", "Hybrid", "On-site"] as const;

function Overlays() {
  const [dialog, setDialog] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState<"logout" | "delete" | null>(null);
  const [pending, setPending] = useState(false);
  const [modes, setModes] = useState<string[]>(["Remote"]);
  const [filter, setFilter] = useState("All");
  const runConfirm = () => {
    setPending(true);
    window.setTimeout(() => {
      setPending(false);
      setConfirm(null);
      toast.success(confirm === "delete" ? "Account deleted (demo)" : "Logged out (demo)");
    }, 1200);
  };
  return <Section title="Overlays">
    <Inline gap="2" wrap>
      <Button variant="secondary" onClick={() => setDialog(true)}>Open dialog</Button>
      <Button variant="secondary" onClick={() => setSheet(true)}>Open filter sheet</Button>
      <Button variant="secondary" onClick={() => setConfirm("logout")}>Log out…</Button>
      <Button variant="danger" onClick={() => setConfirm("delete")}>Delete account…</Button>
    </Inline>
    <Inline justify="between">
      <Text>Job row actions</Text>
      <Inline gap="1">
        <Menu trigger={{ icon: DotsThreeVertical, label: "Actions for Frontend Engineer at Stripe", size: "sm" }}>
          <MenuItem icon={BookmarkSimple} onSelect={() => toast.success("Saved")}>Save</MenuItem>
          <MenuItem icon={EyeSlash} onSelect={() => toast.show({ message: "Job hidden", action: { label: "Undo", run: () => { toast.show("Restored"); } }, duration: UNDO_TOAST_DURATION })}>Hide</MenuItem>
          <MenuSeparator />
          <MenuItem icon={Trash} tone="danger" onSelect={() => toast.error("Couldn't delete. Try again.")}>Delete</MenuItem>
          <MenuItem icon={CheckCircle} disabled onSelect={() => {}}>Disabled</MenuItem>
        </Menu>
        <Menu trigger={{ icon: DotsThree, label: "More job actions" }}>
          <MenuItem onSelect={() => {}}>Report a problem</MenuItem>
        </Menu>
      </Inline>
    </Inline>
    <Text id="kit-work-mode" size="sm" weight="medium" tone="ink-2">Work mode</Text>
    <Menu align="start" label="Work modes" trigger={{ value: modes.join(", "), placeholder: "Choose work modes", labelledBy: "kit-work-mode" }}>
      {workModes.map((mode) =>
        <MenuCheckboxItem key={mode} checked={modes.includes(mode)}
          onCheckedChange={(on) => setModes(on ? [...modes, mode] : modes.filter((item) => item !== mode))}>
          {mode}
        </MenuCheckboxItem>)}
    </Menu>

    <Dialog open={dialog} onOpenChange={setDialog} title="Request a company" subtitle="We'll add its career page to the feed.">
      <Form aria-label="Request a company" onSubmit={() => setDialog(false)}>
        <Field label="Company name"><Input placeholder="Stripe" /></Field>
        <Field label="Careers page" optional><Input type="url" placeholder="https://" /></Field>
        <Button type="submit" variant="primary" fullWidth>Send request</Button>
      </Form>
    </Dialog>
    <Sheet open={sheet} onOpenChange={setSheet} title="Filters" closeLabel="Close filters" footer={<>
      <Button variant="secondary" onClick={() => setFilter("All")}>Reset</Button>
      <Button variant="primary" onClick={() => setSheet(false)}>Show 128 jobs</Button>
    </>}>
      <Text size="xs" weight="semibold" tone="ink-4">Listing</Text>
      <ToggleGroup label="Listing" value={filter} onValueChange={setFilter}
        options={["All", "Internship", "New grad", "Early career"].map((value) => ({ value, label: value }))} />
      {Array.from({ length: 8 }, (_, index) =>
        <Inline key={index} justify="between"><Text>Filter row {index + 1}</Text><Switch label={`Filter ${index + 1}`} checked={index % 2 === 0} onCheckedChange={() => {}} /></Inline>)}
    </Sheet>
    <AlertDialog
      open={confirm === "logout"}
      onOpenChange={(open) => !open && setConfirm(null)}
      title="Log out?"
      description="You'll be signed out on this device. Your account data stays saved."
      confirmLabel="Log out"
      pending={pending}
      onConfirm={runConfirm}
    />
    <AlertDialog
      open={confirm === "delete"}
      onOpenChange={(open) => !open && setConfirm(null)}
      title="Delete your account?"
      description="Your account and synced data will be permanently deleted. This cannot be undone."
      confirmLabel="Delete account"
      tone="danger"
      pending={pending}
      onConfirm={runConfirm}
    />
  </Section>;
}

function Hints() {
  const [saved, setSaved] = useState(false);
  return <Section title="Tooltips and popovers">
    <Text size="sm" tone="ink-3">Tooltips show on hover or keyboard focus with a mouse; touch skips them.</Text>
    <Inline gap="2">
      <IconButton icon={BookmarkSimple} label={saved ? "Unsave job" : "Save job"} tooltip pressed={saved} onClick={() => setSaved(!saved)} />
      <IconButton icon={EyeSlash} label="Hide job" tooltip />
      <IconButton icon={ArrowSquareOut} label="Open the posting" tooltip surface />
      <Tooltip content="Sends from your connected inbox"><Button variant="secondary" size="compact" icon={PaperPlaneTilt}>Send</Button></Tooltip>
    </Inline>
    <Inline gap="1">
      <Text as="span">Match score 86</Text>
      <InfoTip label="About match scores" title="Match score">
        How closely the role fits your search preferences and resume. It doesn't affect which jobs you see.
      </InfoTip>
    </Inline>
    <Inline gap="2">
      <Popover title="Why this job?" trigger={<Button variant="secondary" size="compact">Why this job?</Button>}>
        New grad software role in Chicago, posted 2 days ago on the company's career page.
      </Popover>
      <Popover align="start" trigger={<IconButton icon={DotsThree} label="Popover from an icon button" tooltip />}>
        <Stack gap="2">
          <Text size="sm">Popovers can hold controls.</Text>
          <Button variant="primary" size="compact">Do it</Button>
        </Stack>
      </Popover>
    </Inline>
  </Section>;
}

function Feedback() {
  const [step, setStep] = useState(2);
  return <Section title="Feedback">
    <Inline gap="2" wrap>
      <Button variant="secondary" size="compact" onClick={() => toast.show("Preferences updated")}>Info toast</Button>
      <Button variant="secondary" size="compact" onClick={() => toast.success("Resume uploaded")}>Success</Button>
      <Button variant="secondary" size="compact" onClick={() => toast.warning("Some jobs couldn't load")}>Warning</Button>
      <Button variant="secondary" size="compact" onClick={() => toast.error("Couldn't save. Check your connection.", { duration: null })}>Error (stays)</Button>
      <Button variant="secondary" size="compact" onClick={() => toast.show({ message: "Saving…", dedupeKey: "kit-save" })}>Deduped</Button>
    </Inline>
    <Stack gap="2">
      <Text size="sm" tone="ink-3">Onboarding steps</Text>
      <Progress label="Setup progress" variant="steps" value={step} max={4} valueText={`Step ${step} of 4`} />
      <Inline gap="2">
        <Button size="compact" variant="secondary" onClick={() => setStep(Math.max(1, step - 1))}>Back</Button>
        <Button size="compact" variant="secondary" onClick={() => setStep(Math.min(4, step + 1))}>Next</Button>
      </Inline>
    </Stack>
    <Stack gap="2">
      <Text size="sm" tone="ink-3">Usage meter</Text>
      <Progress label="Tailoring credits used" value={7} max={20} valueText="7 of 20 used" />
    </Stack>
  </Section>;
}

function Disclosures() {
  const [view, setView] = useState<"saved" | "applied">("saved");
  return <Section title="Tabs and disclosure">
    <Tabs label="Your jobs" value={view} onValueChange={setView} tabs={[
      { value: "saved", label: "Saved", icon: BookmarkSimple, count: 12 },
      { value: "applied", label: "Applied", icon: PaperPlaneTilt, count: 3 },
    ]}>
      <TabPanel value="saved"><Text tone="ink-3">Saved jobs panel</Text></TabPanel>
      <TabPanel value="applied"><Text tone="ink-3">Applied jobs panel</Text></TabPanel>
    </Tabs>
    <Disclosure summary="More options">
      <Field label="Minimum salary" optional><Input inputMode="numeric" placeholder="120" /></Field>
      <Checkbox checked onCheckedChange={() => {}}>Include unspecified experience</Checkbox>
    </Disclosure>
  </Section>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Stack as="section" gap="4">
    <Text size="xs" weight="semibold" tone="ink-4">{title}</Text>
    <Stack gap="3">{children}</Stack>
  </Stack>;
}
