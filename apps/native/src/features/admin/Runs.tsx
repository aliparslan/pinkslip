import { formatDuration, formatMinutes, parseRunIssues, type RunIssue } from "@pinkslip/core/admin-format";
import type { FetchRun } from "@pinkslip/core/api";
import { MANUAL_SWEEP_BATCHES, useRefreshAllSources, useRunLatency, useRuns } from "@pinkslip/data";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Badge, Button, Disclosure, Inline, Screen, Spinner, Stack, Text, toast, usePullToRefresh } from "../../kit";
import { Entries, Entry, Failure, SectionHead } from "./parts";

const runDate = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function StatusDot({ bad }: { bad: boolean }) {
  return <View style={[styles.dot, bad && styles.dotBad]} />;
}

function Issue({ issue }: { issue: RunIssue }) {
  return <Stack gap="1">
    {issue.companyName ? <Text size="sm" weight="medium">{issue.companyName}</Text> : null}
    <Text size="sm" tone="ink-3">{issue.error}</Text>
  </Stack>;
}

function RunEntry({ run }: { run: FetchRun }) {
  const issues = parseRunIssues(run.errors_json);
  const more = issues.length - 2;
  return <Entry>
    <Inline justify="between" gap="2">
      <Inline gap="2" flex>
        <StatusDot bad={run.status === "error"} />
        <Text weight="medium">{run.status === "error" ? "Completed with errors" : run.status === "running" ? "Running" : "Completed"}</Text>
      </Inline>
      <Badge>{run.notifications_sent} {run.notifications_sent === 1 ? "push" : "pushes"}</Badge>
    </Inline>
    <Text size="sm" tone="ink-2">{run.new_jobs_found} new · {run.companies_succeeded}/{run.companies_attempted} sources · {formatDuration(run.duration_ms)}</Text>
    <Text size="sm" tone="ink-3">{runDate(run.started_at)}</Text>
    {issues.slice(0, 2).map((issue, index) => <Issue key={index} issue={issue} />)}
    {more > 0 && <Disclosure summary={`${more} more failing ${more === 1 ? "source" : "sources"}`}>
      <Stack gap="2">{issues.slice(2).map((issue, index) => <Issue key={index} issue={issue} />)}</Stack>
    </Disclosure>}
  </Entry>;
}

/** The web admin's Runs: poll every source now, alert speed per poll tier,
 * and the recent fetch runs with their failing sources. */
export function Runs() {
  const runs = useRuns();
  const latency = useRunLatency();
  const [batch, setBatch] = useState<number | null>(null);
  const refresh = useRefreshAllSources(setBatch);
  const pull = usePullToRefresh(() => Promise.all([runs.refetch(), latency.refetch()]));
  const runNow = () => refresh.mutate(undefined, {
    onSuccess: ({ polled, found }) => toast.success(`Polled ${polled} companies · ${found} new jobs`),
    onError: () => toast.error("The poll stopped early. Try again."),
    onSettled: () => setBatch(null),
  });

  return <Screen refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
    <Stack gap="2">
      <View style={styles.card}>
        <Inline justify="between" gap="3">
          <Stack gap="1" flex>
            <Text weight="medium">Refresh every source</Text>
            <Text size="sm" tone="ink-3">
              {batch ? `Polling batch ${batch} of ${MANUAL_SWEEP_BATCHES}…` : "Run the full company poll now."}
            </Text>
          </Stack>
          <Button size="compact" pending={refresh.isPending} onPress={runNow}>Run now</Button>
        </Inline>
      </View>
      {refresh.data && refresh.data.log.length > 0 && <Disclosure summary="Latest poll log">
        <Stack gap="1">{refresh.data.log.slice(0, 8).map((line, index) => <Text key={index} size="xs" tone="ink-3">{line}</Text>)}</Stack>
      </Disclosure>}
    </Stack>

    {latency.data && latency.data.length > 0 && <Stack gap="2">
      <SectionHead title="Alert speed" count="p50 · p95" />
      <Entries empty="">{latency.data.map((tier) => <Entry key={tier.tier}>
        <Inline justify="between" gap="2">
          <Inline gap="2" flex>
            <StatusDot bad={tier.overdue_sources > 0} />
            <Text weight="medium">Tier {tier.tier} · every {formatMinutes(tier.target_interval_minutes)}</Text>
          </Inline>
          <Badge>{tier.mode === "queue" ? "Queue" : "Cron"}</Badge>
        </Inline>
        <Text size="sm" tone="ink-2">
          Polled every {formatMinutes(tier.poll_gap.p50_minutes)} · {formatMinutes(tier.poll_gap.p95_minutes)}. Push {formatMinutes(tier.alert_delay.p50_minutes)} · {formatMinutes(tier.alert_delay.p95_minutes)} after discovery
        </Text>
        <Text size="sm" tone="ink-3">
          {tier.estimated_p95_minutes !== null ? `Worst case about ${formatMinutes(tier.estimated_p95_minutes)} · ` : ""}{tier.sources} sources
          {tier.overdue_sources > 0 ? <Text size="sm" tone="bad">{` · ${tier.overdue_sources} overdue`}</Text> : null}
        </Text>
      </Entry>)}</Entries>
    </Stack>}

    <Stack gap="2">
      <SectionHead title="Recent runs" count={runs.data ? `${runs.data.length} loaded` : undefined} />
      {runs.isPending ? <Spinner label="Loading runs" />
        : runs.isError ? <Failure title="Runs didn't load" onRetry={() => void runs.refetch()} retrying={runs.isFetching} />
        : <Entries empty="No fetch runs yet.">{runs.data.slice(0, 12).map((run) => <RunEntry key={run.id} run={run} />)}</Entries>}
    </Stack>
  </Screen>;
}

const styles = StyleSheet.create((theme) => ({
  card: { padding: theme.space["4"], borderRadius: theme.radius.lg, borderCurve: "continuous", backgroundColor: theme.colors["bg-elev"] },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.good },
  dotBad: { backgroundColor: theme.colors.bad },
}));
