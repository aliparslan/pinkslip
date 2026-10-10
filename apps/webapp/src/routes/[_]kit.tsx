import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Bell, BookmarkSimple, Buildings, CaretRight, MagnifyingGlass } from "@phosphor-icons/react";
import {
  Badge, Heading, Icon, Inline, Separator, Skeleton, Spinner, Stack, Surface, Text, VisuallyHidden,
  type IconSize, type TextTone,
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

    <Section title="Assistive text">
      <Text>Visible text<VisuallyHidden> with a hidden suffix for screen readers</VisuallyHidden>.</Text>
    </Section>
  </Stack>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <Stack as="section" gap="4">
    <Text size="xs" weight="semibold" tone="ink-4">{title}</Text>
    <Stack gap="3">{children}</Stack>
  </Stack>;
}
