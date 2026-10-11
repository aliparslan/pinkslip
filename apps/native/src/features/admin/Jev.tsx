import { describeCall, readableCode } from "@pinkslip/core/admin-format";
import type { ClassificationCall, ClassificationDisagreement, ClassificationVerdict } from "@pinkslip/core/api";
import { useClassificationReport, useClassificationVerdict } from "@pinkslip/data";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button, Disclosure, Inline, Screen, SegmentedControl, Spinner, Stack, Text, toast, usePullToRefresh } from "../../kit";
import { Centered, Entries, Entry, Failure, LinkOut, SectionHead } from "./parts";

const VERDICTS: { id: ClassificationVerdict; label: string }[] = [
  { id: "rules", label: "Rules right" },
  { id: "jev", label: "Jev right" },
  { id: "neither", label: "Both wrong" },
  { id: "unclear", label: "Not sure" },
];

type JevView = "open" | "reviewed";

function Call({ who, call }: { who: string; call: ClassificationCall }) {
  return <Inline gap="2">
    <View style={styles.who}><Text size="sm" tone="ink-3">{who}</Text></View>
    <Text size="sm" weight="medium" tone={call.decision === "include" ? "good" : "ink"}>{describeCall(call)}</Text>
  </Inline>;
}

/** The web admin's Jev: how often the rules and Jev (the model classifier)
 * agree, and each disagreement to judge: who got it right. */
export function Jev() {
  const report = useClassificationReport();
  const verdict = useClassificationVerdict();
  const [view, setView] = useState<JevView>("open");
  const pull = usePullToRefresh(() => report.refetch());

  if (report.isPending) return <Centered><Spinner label="Loading Jev comparisons" /></Centered>;
  if (report.isError) return <Centered><Failure title="Comparisons didn't load" onRetry={() => void report.refetch()} retrying={report.isFetching} /></Centered>;
  const data = report.data;
  if (!data.available) return <Screen><Text tone="ink-3">Run the latest database migration to review Jev comparisons.</Text></Screen>;

  const rows = data.disagreements ?? [];
  const open = rows.filter((row) => !row.review);
  const reviewed = rows.filter((row) => row.review);
  const counts = data.counts;
  const compared = counts ? counts.agree + counts.rules_only + counts.jev_only : 0;
  const tally = (id: ClassificationVerdict) => reviewed.filter((row) => row.review?.verdict === id).length;
  const judge = (row: ClassificationDisagreement, id: ClassificationVerdict | null) =>
    verdict.mutate({ cacheKey: row.cache_key, verdict: id }, { onError: () => toast.error("Couldn't save that. Try again.") });
  const visible = view === "open" ? open : reviewed;
  const busy = (row: ClassificationDisagreement) => verdict.isPending && verdict.variables?.cacheKey === row.cache_key;

  return <Screen refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
    <Stack gap="2">
      <SectionHead title="Rules vs Jev" count={`$${(data.month_spent_usd ?? 0).toFixed(2)} of $${(data.monthly_budget_usd ?? 0).toFixed(2)} this month`} />
      <View style={styles.card}>
        {compared === 0
          ? <Text>No jobs compared yet. Jev checks a sample of new listings four times an hour.</Text>
          : <Stack gap="2">
            <Text><Text weight="semibold">{counts?.agree ?? 0} of {compared}</Text> compared jobs got the same call. The rules took {counts?.rules_only ?? 0} that Jev would skip, and Jev took {counts?.jev_only ?? 0} that the rules skipped.</Text>
            <Text size="sm" tone="ink-3">
              {reviewed.length > 0
                ? `You've reviewed ${reviewed.length}: rules right ${tally("rules")}, Jev right ${tally("jev")}, both wrong ${tally("neither")}.`
                : "Review the disagreements below to measure who's more often right."}
              {counts && counts.jev_unsure > 0 ? ` Jev was unsure on ${counts.jev_unsure}.` : ""}
            </Text>
          </Stack>}
      </View>
    </Stack>

    <Stack gap="3">
      <SegmentedControl<JevView> value={view} onValueChange={setView}
        segments={[{ value: "open", label: `To review ${open.length}` }, { value: "reviewed", label: `Reviewed ${reviewed.length}` }]} />
      <Entries empty={view === "open" ? "Nothing to review." : "No reviews yet."}>{visible.map((row) => <Entry key={row.cache_key}>
        <Stack gap="1">
          <Text weight="medium">{row.title ?? "Untitled listing"}</Text>
          <Text size="sm" tone="ink-3">{row.location ? `${row.company} · ${row.location}` : row.company}</Text>
        </Stack>
        <Stack gap="1">
          <Call who="Rules" call={row.rules} />
          <Call who="Jev" call={row.jev} />
        </Stack>
        {row.truncated ? <Text size="sm" tone="ink-3">Jev only saw the first 12,000 characters of this posting.</Text> : null}
        <Disclosure summary="Compare answers">
          <Stack gap="2">
            {row.fields.map((field) => <Stack key={field.field} gap="1">
              <Text size="sm" weight="medium" tone={field.mismatch ? "warn" : "ink"}>{field.label}</Text>
              <Text size="sm" tone="ink-2">Rules: {readableCode(field.rules)}</Text>
              <Text size="sm" tone="ink-2">Jev: {readableCode(field.jev)}{field.confidence === null ? "" : ` · ${Math.round(field.confidence * 100)}%`}</Text>
            </Stack>)}
          </Stack>
        </Disclosure>
        {row.job_url ? <LinkOut label="Posting" href={row.job_url} /> : null}
        {row.review
          ? <Inline gap="2" justify="end">
            <Text size="sm" weight="medium">{VERDICTS.find((option) => option.id === row.review?.verdict)?.label}</Text>
            <Button size="compact" disabled={verdict.isPending} pending={busy(row)} onPress={() => judge(row, null)}>Change</Button>
          </Inline>
          : <Stack gap="2" accessibilityLabel="Who got it right?">
            {[VERDICTS.slice(0, 2), VERDICTS.slice(2)].map((pair) => <Inline key={pair[0].id} gap="2">
              {pair.map((option) => <View key={option.id} style={styles.half}>
                <Button fullWidth size="compact" disabled={verdict.isPending} onPress={() => judge(row, option.id)}>{option.label}</Button>
              </View>)}
            </Inline>)}
          </Stack>}
      </Entry>)}</Entries>
    </Stack>
  </Screen>;
}

const styles = StyleSheet.create((theme) => ({
  card: { padding: theme.space["4"], borderRadius: theme.radius.lg, borderCurve: "continuous", backgroundColor: theme.colors["bg-elev"] },
  who: { width: 44 },
  half: { flex: 1 },
}));
