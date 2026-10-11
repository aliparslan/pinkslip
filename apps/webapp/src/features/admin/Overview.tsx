import { productHealthGroups, type MetricRow } from "@pinkslip/core/admin-format";
import { useProductMetrics } from "@pinkslip/data";
import { Heading, Stack, Surface, Text } from "../../kit";
import { InlineFailure, PageLoading } from "../states/LoadStates";
import styles from "./Admin.module.css";

type Rows = MetricRow[];

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
        {productHealthGroups(metrics.data).map((group) => <Group key={group.title} {...group} />)}
      </div>}
  </Stack>;
}
