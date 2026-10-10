import { useState } from "react";
import { ArrowSquareOut } from "@phosphor-icons/react";
import type { ClassificationCall, ClassificationDisagreement, ClassificationVerdict } from "@pinkslip/core/api";
import { useClassificationReport, useClassificationVerdict } from "@pinkslip/data";
import { Button, Disclosure, Heading, Separator, Stack, Surface, Tabs, Text, toast } from "../../kit";
import { InlineFailure, PageLoading } from "../states/LoadStates";
import styles from "./Admin.module.css";

const VERDICTS: { id: ClassificationVerdict; label: string }[] = [
  { id: "rules", label: "Rules right" },
  { id: "jev", label: "Jev right" },
  { id: "neither", label: "Both wrong" },
  { id: "unclear", label: "Not sure" },
];

const REASONS: Record<string, string> = {
  location: "outside the US",
  management: "management role",
  no_technical_signal: "not a technical role",
  non_technical_function: "not a technical role",
  other_engineering_discipline: "non-software engineering",
  seniority: "too senior",
  clearance: "needs a clearance",
};

const readable = (value: string) => value.replaceAll("_", " ");

export function describeCall(call: ClassificationCall): string {
  if (call.decision === "include") return "Include";
  if (call.decision === "unsure") return "Unsure";
  return call.reason ? `Exclude · ${REASONS[call.reason] ?? readable(call.reason)}` : "Exclude";
}

type View = "open" | "reviewed";

/** `JevSection.svelte`: how often the rules and Jev (the LLM classifier)
 * agree, and each disagreement to judge: who got it right. */
export function Jev() {
  const report = useClassificationReport();
  const verdict = useClassificationVerdict();
  const [view, setView] = useState<View>("open");

  const header = <Heading level={1} variant="screen">Jev</Heading>;
  if (report.isPending) return <Stack gap="5">{header}<PageLoading label="Loading Jev comparisons" /></Stack>;
  if (report.isError) {
    return <Stack gap="5">{header}<InlineFailure title="Comparisons didn't load" onRetry={() => void report.refetch()} retrying={report.isFetching} /></Stack>;
  }
  const data = report.data;
  if (!data.available) {
    return <Stack gap="5">{header}<Text tone="ink-3">Run the latest database migration to review Jev comparisons.</Text></Stack>;
  }

  const rows = data.disagreements ?? [];
  const open = rows.filter((row) => !row.review);
  const reviewed = rows.filter((row) => row.review);
  const counts = data.counts;
  const compared = counts ? counts.agree + counts.rules_only + counts.jev_only : 0;
  const tally = (id: ClassificationVerdict) => reviewed.filter((row) => row.review?.verdict === id).length;
  const judge = (row: ClassificationDisagreement, id: ClassificationVerdict | null) =>
    verdict.mutate({ cacheKey: row.cache_key, verdict: id }, { onError: () => toast.error("Couldn't save that. Try again.") });
  const visible = view === "open" ? open : reviewed;

  return <Stack gap="6">
    {header}
    <Stack as="section" gap="2">
      <div className={styles.sectionHead}>
        <Heading level={2} variant="section">Rules vs Jev</Heading>
        <Text size="sm" tone="ink-3">${(data.month_spent_usd ?? 0).toFixed(2)} of ${(data.monthly_budget_usd ?? 0).toFixed(2)} this month</Text>
      </div>
      <Surface variant="card">
        {compared === 0
          ? <Text>No jobs compared yet. Jev checks a sample of new listings four times an hour.</Text>
          : <Stack gap="2">
            <Text><strong>{counts?.agree ?? 0} of {compared}</strong> compared jobs got the same call. The rules took {counts?.rules_only ?? 0} that Jev would skip, and Jev took {counts?.jev_only ?? 0} that the rules skipped.</Text>
            <Text size="sm" tone="ink-3">
              {reviewed.length > 0
                ? `You've reviewed ${reviewed.length}: rules right ${tally("rules")}, Jev right ${tally("jev")}, both wrong ${tally("neither")}.`
                : "Review the disagreements below to measure who's more often right."}
              {counts && counts.jev_unsure > 0 && ` Jev was unsure on ${counts.jev_unsure}.`}
            </Text>
          </Stack>}
      </Surface>
    </Stack>

    <Stack as="section" gap="3">
      <Heading level={2} variant="section">Disagreements</Heading>
      <Tabs<View> label="Disagreements" value={view} onValueChange={setView} tabs={[
        { value: "open", label: "To review", count: open.length },
        { value: "reviewed", label: "Reviewed", count: reviewed.length },
      ]} />
      {visible.length === 0
        ? <Surface variant="list"><div className={styles.empty}>{view === "open" ? "Nothing to review." : "No reviews yet."}</div></Surface>
        : <Surface variant="list" bleedOnPhone as="ul">
          {visible.map((row, index) => <li key={row.cache_key} className={styles.item}>
            {index > 0 && <Separator />}
            <div className={styles.entry} aria-busy={verdict.isPending && verdict.variables?.cacheKey === row.cache_key ? true : undefined}>
              <span className={styles.entryCopy}>
                <Text weight="medium">{row.title ?? "Untitled listing"}</Text>
                <Text size="sm" tone="ink-3">{row.location ? `${row.company} · ${row.location}` : row.company}</Text>
              </span>
              <dl className={styles.calls}>
                <div className={styles.call} data-include={row.rules.decision === "include" || undefined}><dt>Rules</dt><dd>{describeCall(row.rules)}</dd></div>
                <div className={styles.call} data-include={row.jev.decision === "include" || undefined}><dt>Jev</dt><dd>{describeCall(row.jev)}</dd></div>
              </dl>
              {row.truncated && <Text size="sm" tone="ink-3">Jev only saw the first 12,000 characters of this posting.</Text>}
              <Disclosure summary="Compare answers">
                <table className={styles.table}>
                  <thead><tr><th scope="col"><span hidden>Field</span></th><th scope="col">Rules</th><th scope="col">Jev</th></tr></thead>
                  <tbody>
                    {row.fields.map((field) => <tr key={field.field} data-mismatch={field.mismatch || undefined}>
                      <th scope="row">{field.label}</th>
                      <td>{readable(field.rules)}</td>
                      <td>{readable(field.jev)}{field.confidence === null ? "" : ` · ${Math.round(field.confidence * 100)}%`}</td>
                    </tr>)}
                  </tbody>
                </table>
              </Disclosure>
              {row.job_url && <div className={styles.links}>
                <a className={styles.link} href={row.job_url} target="_blank" rel="noopener noreferrer"><ArrowSquareOut size={15} aria-hidden /> Posting</a>
              </div>}
              {row.review
                ? <div className={styles.actions}>
                  <Text size="sm" weight="medium">{VERDICTS.find((option) => option.id === row.review?.verdict)?.label}</Text>
                  <Button size="compact" disabled={verdict.isPending} onClick={() => judge(row, null)}>Change</Button>
                </div>
                : <div className={styles.actions} role="group" aria-label="Who got it right?">
                  {VERDICTS.map((option) => <Button key={option.id} size="compact" disabled={verdict.isPending} onClick={() => judge(row, option.id)}>{option.label}</Button>)}
                </div>}
            </div>
          </li>)}
        </Surface>}
    </Stack>
  </Stack>;
}
