import { productHealthGroups } from "@pinkslip/core/admin-format";
import { useProductMetrics } from "@pinkslip/data";
import { ListRow, ListSection, Screen, Spinner, Text, usePullToRefresh } from "../../kit";
import { Centered, Failure } from "./parts";

/** Product health for the last period: alerts, search quality, conversion,
 * tailoring quality and the inbox, as label and value rows. */
export function ProductHealth() {
  const metrics = useProductMetrics();
  const pull = usePullToRefresh(() => metrics.refetch());
  if (metrics.isPending) return <Centered><Spinner label="Loading product health" /></Centered>;
  if (metrics.isError) return <Centered><Failure title="Product health didn't load" onRetry={() => void metrics.refetch()} retrying={metrics.isFetching} /></Centered>;
  return <Screen refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
    <Text size="sm" tone="ink-3">Last {metrics.data.period_days} days</Text>
    {productHealthGroups(metrics.data).map((group) => <ListSection key={group.title} label={group.title}>
      {group.rows
        ? group.rows.map(([label, value]) => <ListRow key={label} title={label} accessory={<Text tone="ink-2">{String(value)}</Text>} />)
        : [<ListRow key="empty" title={group.empty} />]}
    </ListSection>)}
  </Screen>;
}
