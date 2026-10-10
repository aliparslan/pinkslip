import { useState } from "react";
import type { FetchRun } from "@pinkslip/core/api";
import { MANUAL_SWEEP_BATCHES, useRefreshAllSources, useRunLatency, useRuns } from "@pinkslip/data";
import { Badge, Button, Disclosure, Heading, Separator, Stack, Surface, Text, toast } from "../../kit";
import { friendlyPollError } from "../companies/Sources";
import { InlineFailure, PageLoading } from "../states/LoadStates";
import styles from "./Admin.module.css";

interface RunIssue { companyName?: string; error: string }

export function formatDuration(ms: number | null): string {
  const value = ms ?? 0;
  if (value < 1000) return `${value} ms`;
  if (value < 60_000) return `${Math.round(value / 100) / 10} sec`;
  return `${Math.floor(value / 60_000)} min ${Math.round((value % 60_000) / 1000)} sec`;
}

export function formatMinutes(value: number | null): string {
  if (value === null) return "—";
  if (value < 1) return "under 1 min";
  if (value < 60) return `${Math.round(value)} min`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

const runDate = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** A run's `errors_json`: a list of {companyName, error}, or a bare string. */
export function parseRunIssues(value: string | null): RunIssue[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [{ error: friendlyPollError(value) }];
    return parsed
      .filter((issue): issue is Record<string, unknown> => Boolean(issue) && typeof issue === "object")
      .map((issue) => ({
        companyName: typeof issue.companyName === "string" ? issue.companyName : undefined,
        error: typeof issue.error === "string" ? friendlyPollError(issue.error) : "Unknown source error",
      }));
  } catch {
    return [{ error: friendlyPollError(value) }];
  }
}

function Issue({ issue }: { issue: RunIssue }) {
  return <div className={styles.issue}>
    {issue.companyName && <Text as="strong" size="sm" weight="medium">{issue.companyName}</Text>}
    <Text as="span" size="sm" tone="ink-3">{issue.error}</Text>
  </div>;
}

function RunEntry({ run }: { run: FetchRun }) {
  const issues = parseRunIssues(run.errors_json);
  return <>
    <div className={styles.entryHead}>
      <span className={styles.runTitle}>
        <span className={styles.status} data-bad={run.status === "error" || undefined} aria-hidden />
        <Text weight="medium">{run.status === "error" ? "Completed with errors" : run.status === "running" ? "Running" : "Completed"}</Text>
      </span>
      <Badge>{run.notifications_sent} {run.notifications_sent === 1 ? "push" : "pushes"}</Badge>
    </div>
    <Text size="sm" tone="ink-2">
      {run.new_jobs_found} new · {run.companies_succeeded}/{run.companies_attempted} sources · {formatDuration(run.duration_ms)}
    </Text>
    <Text size="sm" tone="ink-3">{runDate(run.started_at)}</Text>
    {issues.slice(0, 2).map((issue, index) => <Issue key={index} issue={issue} />)}
    {issues.length > 2 && <Disclosure summary={`${issues.length - 2} more failing ${issues.length - 2 === 1 ? "source" : "sources"}`}>
      <Stack gap="1">{issues.slice(2).map((issue, index) => <Issue key={index} issue={issue} />)}</Stack>
    </Disclosure>}
  </>;
}

/** `RunsSection.svelte`: run every source now, alert speed per poll tier, and
 * the recent fetch runs with their failing sources. */
export function Runs() {
  const runs = useRuns();
  const latency = useRunLatency();
  const [batch, setBatch] = useState<number | null>(null);
  const refresh = useRefreshAllSources(setBatch);
  const runNow = () => refresh.mutate(undefined, {
    onSuccess: ({ polled, found }) => toast.success(`Polled ${polled} companies · ${found} new jobs`),
    onError: () => toast.error("The poll stopped early. Try again."),
    onSettled: () => setBatch(null),
  });

  return <Stack gap="6">
    <Heading level={1} variant="screen">Runs</Heading>
    <Stack as="section" gap="2">
      <Surface variant="card">
        <div className={styles.entryHead}>
          <span className={styles.entryCopy}>
            <Text weight="medium">Refresh every source</Text>
            <Text size="sm" tone="ink-3" aria-live="polite">
              {batch ? `Polling batch ${batch} of ${MANUAL_SWEEP_BATCHES}…` : "Run the full company poll now."}
            </Text>
          </span>
          <Button pending={refresh.isPending} onClick={runNow}>Run now</Button>
        </div>
      </Surface>
      {refresh.data && refresh.data.log.length > 0 && <Disclosure summary="Latest poll log">
        <div className={styles.log}>{refresh.data.log.slice(0, 8).map((line, index) => <span key={index}>{line}</span>)}</div>
      </Disclosure>}
    </Stack>

    {latency.data && latency.data.length > 0 && <Stack as="section" gap="2">
      <div className={styles.sectionHead}>
        <Heading level={2} variant="section">Alert speed</Heading>
        <Text size="sm" tone="ink-3">p50 · p95</Text>
      </div>
      <Surface variant="list" bleedOnPhone as="ul">
        {latency.data.map((tier, index) => <li key={tier.tier} className={styles.item}>
          {index > 0 && <Separator />}
          <div className={styles.entry}>
          <div className={styles.entryHead}>
            <span className={styles.runTitle}>
              <span className={styles.status} data-bad={tier.overdue_sources > 0 || undefined} aria-hidden />
              <Text weight="medium">Tier {tier.tier} · every {formatMinutes(tier.target_interval_minutes)}</Text>
            </span>
            <Badge>{tier.mode === "queue" ? "Queue" : "Cron"}</Badge>
          </div>
          <Text size="sm" tone="ink-2">
            Polled every {formatMinutes(tier.poll_gap.p50_minutes)} · {formatMinutes(tier.poll_gap.p95_minutes)}.
            Push {formatMinutes(tier.alert_delay.p50_minutes)} · {formatMinutes(tier.alert_delay.p95_minutes)} after discovery
          </Text>
          <Text size="sm" tone="ink-3">
            {tier.estimated_p95_minutes !== null && `Worst case about ${formatMinutes(tier.estimated_p95_minutes)} · `}
            {tier.sources} sources
            {tier.overdue_sources > 0 && <Text as="span" size="sm" tone="bad"> · {tier.overdue_sources} overdue</Text>}
          </Text>
          </div>
        </li>)}
      </Surface>
    </Stack>}

    <Stack as="section" gap="2">
      <div className={styles.sectionHead}>
        <Heading level={2} variant="section">Recent runs</Heading>
        {runs.data && <Text size="sm" tone="ink-3">{runs.data.length} loaded</Text>}
      </div>
      {runs.isPending ? <PageLoading label="Loading runs" />
        : runs.isError ? <InlineFailure title="Runs didn't load" onRetry={() => void runs.refetch()} retrying={runs.isFetching} />
        : runs.data.length === 0 ? <Surface variant="list"><div className={styles.empty}>No fetch runs yet.</div></Surface>
        : <Surface variant="list" bleedOnPhone as="ul">
          {runs.data.slice(0, 12).map((run, index) => <li key={run.id} className={styles.item}>
            {index > 0 && <Separator />}
            <div className={styles.entry}><RunEntry run={run} /></div>
          </li>)}
        </Surface>}
    </Stack>
  </Stack>;
}
