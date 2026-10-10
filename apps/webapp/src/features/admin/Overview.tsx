import type { ReactNode } from "react";
import type { ProductMetrics } from "@pinkslip/core/api";
import { useProductMetrics } from "@pinkslip/data";
import { Heading, Stack, Surface, Text } from "../../kit";
import { InlineFailure, PageLoading } from "../states/LoadStates";
import styles from "./Admin.module.css";

export function formatLatency(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} sec`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  return `${Math.round((seconds / 3600) * 10) / 10} hr`;
}

const ratio = (value: number) => `${Math.round(value * 1000) / 10}%`;

type Rows = [label: string, value: ReactNode][];

function Group({ title, rows, empty }: { title: string; rows: Rows | null; empty: string }) {
  return <Surface variant="card" as="section">
    <Stack gap="3">
      <Heading level={3} variant="section">{title}</Heading>
      {rows
        ? <dl className={styles.metricList}>
          {rows.map(([label, value]) => <div key={label} className={styles.metric}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        : <Text size="sm" tone="ink-3">{empty}</Text>}
    </Stack>
  </Surface>;
}

function groups(metrics: ProductMetrics) {
  const quality = metrics.tailoring_quality;
  const alerts = metrics.notification_latency_seconds > 0 || metrics.notification_open_rate > 0
    || metrics.notifications_sent > 0 || metrics.push_registrations > 0;
  const conversion = metrics.apply_clicks_within_one_hour > 0 || metrics.tailoring_to_application_rate > 0 || metrics.accounts_created > 0;
  return [
    { title: "Alerts", empty: "No alert activity in this period.", rows: alerts ? [
      ["Job to alert", formatLatency(metrics.notification_latency_seconds)],
      ["Alert open rate", `${metrics.notification_open_rate}%`],
      ["Alerts sent", metrics.notifications_sent],
      ["Devices registered", metrics.push_registrations],
    ] as Rows : null },
    { title: "Search quality", empty: "", rows: [
      ["Viable profiles", `${metrics.users_with_enough_matches}/${metrics.total_profiles}`],
      ["Onboarding completion", `${metrics.onboarding_completion_rate}%`],
      ["Eligible-job dismissals", `${metrics.eligible_job_dismissal_rate}%`],
      ["Profile changes", metrics.profile_adjustments],
    ] as Rows },
    { title: "Conversion", empty: "No conversion activity in this period.", rows: conversion ? [
      ["Quick apply clicks", metrics.apply_clicks_within_one_hour],
      ["Tailor to apply", `${metrics.tailoring_to_application_rate}%`],
      ["New accounts", metrics.accounts_created],
    ] as Rows : null },
    { title: "Tailoring quality", empty: "No PDFs evaluated yet.", rows: quality.sampleSize > 0 ? [
      ["Evaluated PDFs", `${quality.sampleSize}/20`],
      ["Unsupported claims", ratio(quality.unsupportedClaimRate)],
      ["One-page PDFs", ratio(quality.onePageRate)],
      ["Device compile failures", ratio(quality.deviceFailureRate)],
      ["Supervised beta gate", quality.ready ? "Ready" : quality.insufficientSample ? "Collecting data" : "Blocked"],
    ] as Rows : null },
    { title: "Inbox", empty: "Inbox is clear.", rows: metrics.open_feedback > 0 || metrics.open_reports > 0 ? [
      ["Active feedback", metrics.open_feedback],
      ["Open reports", metrics.open_reports],
    ] as Rows : null },
  ];
}

/** `AdminSection.svelte`: product health for the last period. */
export function Overview() {
  const metrics = useProductMetrics();
  return <Stack gap="5">
    <div className={styles.sectionHead}>
      <Heading level={1} variant="screen">Product health</Heading>
      {metrics.data && <Text size="sm" tone="ink-3">Last {metrics.data.period_days} days</Text>}
    </div>
    {metrics.isPending ? <PageLoading label="Loading product health" />
      : metrics.isError ? <InlineFailure title="Product health didn't load" onRetry={() => void metrics.refetch()} retrying={metrics.isFetching} />
      : <div className={styles.metrics}>
        {groups(metrics.data).map((group) => <Group key={group.title} {...group} />)}
      </div>}
  </Stack>;
}
