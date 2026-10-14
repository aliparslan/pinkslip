import type { ActualRole, RecruiterCandidate, RecruiterKind, RecruiterReviewScore, WorksThere } from "@pinkslip/core/api";
import { useRecruiterLabel, useRecruiterReview, useRunRecruiterSourcing } from "@pinkslip/data";
import { MagnifyingGlass } from "phosphor-react-native";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button, Screen, SegmentedControl, Spinner, Stack, Text, toast, ToggleGroup, usePullToRefresh, type ToggleOption } from "../../kit";
import { Centered, Entries, Entry, Failure, LinkOut, SectionHead } from "./parts";

const WORKS_THERE: ToggleOption<WorksThere>[] = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Not sure" },
];

const ROLES: ToggleOption<ActualRole>[] = [
  { value: "early_career", label: "Early-career" },
  { value: "other_recruiter", label: "Other recruiter" },
  { value: "not_recruiter", label: "Not a recruiter" },
];

const KIND_LABELS: Record<RecruiterKind, string> = {
  early_career: "Early-career recruiter",
  technical: "Technical recruiter",
  recruiter: "Recruiter",
  coordinator: "Recruiting coordinator",
  intern: "Recruiting intern",
  other: "Not a recruiter",
};

/** Left-out reasons worth a second look. The rest name their evidence
 * ("works at Sierra", "based outside the US"). */
const QUESTIONABLE = new Set(["company not confirmed", "not a recruiter", "no usable name"]);

const PAGE = 20;

type ReviewView = "kept" | "left_out" | "reviewed";

const labelled = (row: RecruiterCandidate) => row.works_there !== null && row.actual_role !== null;

function share(right: number, of: number): string {
  return of === 0 ? "none labelled yet" : `${right} of ${of} (${Math.round((right / of) * 100)}%)`;
}

function Score({ score }: { score: RecruiterReviewScore }) {
  return <Stack gap="1">
    <Text size="sm"><Text size="sm" weight="semibold">Works there now:</Text> {share(score.works_there.yes, score.works_there.labelled)}</Text>
    <Text size="sm"><Text size="sm" weight="semibold">Kind right:</Text> {share(score.role.right, score.role.labelled)}</Text>
    <Text size="sm"><Text size="sm" weight="semibold">Early-career right:</Text> {share(score.early_career.right, score.early_career.labelled)}</Text>
    <Text size="sm"><Text size="sm" weight="semibold">Wrongly left out:</Text> {score.left_out_labelled === 0 ? "none labelled yet" : `${score.wrongly_left_out} of ${score.left_out_labelled}`}</Text>
  </Stack>;
}

/** Recruiter sourcing under evaluation: who the search found at each
 * company, and two questions per person to measure it. Nothing here reaches
 * users. See docs/recruiter-contacts-sourcing.md. */
export function Recruiters() {
  const review = useRecruiterReview();
  const label = useRecruiterLabel();
  const run = useRunRecruiterSourcing();
  const [view, setView] = useState<ReviewView>("kept");
  const [shown, setShown] = useState(PAGE);
  const pull = usePullToRefresh(() => review.refetch());

  if (review.isPending) return <Centered><Spinner label="Loading recruiters" /></Centered>;
  if (review.isError) return <Centered><Failure title="Recruiters didn't load" onRetry={() => void review.refetch()} retrying={review.isFetching} /></Centered>;
  const data = review.data;
  if (!data.available) return <Screen><Text tone="ink-3">Run the latest database migration to review recruiters.</Text></Screen>;

  const rows = data.candidates ?? [];
  const kept = rows.filter((row) => row.left_out_reason === null && !labelled(row));
  const leftOut = rows.filter((row) => row.left_out_reason !== null && QUESTIONABLE.has(row.left_out_reason) && !labelled(row));
  const reviewed = rows.filter(labelled);
  const visible = (view === "kept" ? kept : view === "left_out" ? leftOut : reviewed).slice(0, shown);
  const total = view === "kept" ? kept.length : view === "left_out" ? leftOut.length : reviewed.length;
  const companies = data.companies ?? [];
  const pattern = new Map(companies.map((company) => [company.company_id, company]));

  const save = (row: RecruiterCandidate, labels: { works_there?: WorksThere | null; actual_role?: ActualRole | null }) =>
    label.mutate({ id: row.id, labels }, { onError: () => toast.error("Couldn't save that. Try again.") });
  const findMore = () => run.mutate(5, {
    onSuccess: ({ runs }) => {
      const found = runs.reduce((sum, item) => sum + item.kept, 0);
      const failed = runs.filter((item) => item.error).length;
      toast.success(runs.length === 0
        ? "Every company with a website has been searched."
        : `Found ${found} recruiters at ${runs.length - failed} companies${failed ? `; ${failed} failed` : ""}.`);
    },
    onError: () => toast.error("The search didn't finish. Try again."),
  });

  return <Screen refreshing={pull.refreshing} onRefresh={pull.onRefresh}>
    <Stack gap="2">
      <SectionHead title="How it's doing" count={`${companies.length} companies · ${rows.length} people`} />
      <View style={styles.card}>
        <Stack gap="3">
          {data.score ? <Score score={data.score} /> : null}
          <Button icon={MagnifyingGlass} pending={run.isPending} disabled={!data.can_run} onPress={findMore}>
            Search 5 more companies
          </Button>
          <Text size="sm" tone="ink-3">
            {data.can_run
              ? "Picks catalog companies at random, 4 search credits each. Takes about 20 seconds."
              : "Set SERPER_API_KEY on the Worker to search."}
          </Text>
        </Stack>
      </View>
      <Text size="sm" tone="ink-3">Turn on private mode in LinkedIn (Settings → Visibility) first, or people see that you viewed them.</Text>
    </Stack>

    <Stack gap="3">
      <SegmentedControl<ReviewView> value={view} onValueChange={(next) => { setView(next); setShown(PAGE); }}
        segments={[
          { value: "kept", label: `Kept ${kept.length}` },
          { value: "left_out", label: `Left out ${leftOut.length}` },
          { value: "reviewed", label: `Done ${reviewed.length}` },
        ]} />
      <Entries empty={view === "reviewed" ? "Nothing labelled yet." : companies.length === 0 ? "Search some companies to start." : "Nothing left to label here."}>
        {visible.map((row) => {
          const company = pattern.get(row.company_id);
          return <Entry key={row.id}>
            <Stack gap="1">
              <Text weight="medium">{row.name}</Text>
              <Text size="sm" tone="ink-2">{row.current_title ?? row.headline} · {row.company}</Text>
              {row.location ? <Text size="sm" tone="ink-3">{row.location}</Text> : null}
            </Stack>
            <Stack gap="1">
              <Text size="sm">
                <Text size="sm" weight="semibold">{row.left_out_reason ? "Left out: " : "Kept: "}</Text>
                {row.left_out_reason ?? `${KIND_LABELS[row.kind]}${row.kind_from_snippet ? " (from their summary)" : ""}`}
              </Text>
              {row.email_guess ? <Text size="sm" tone="ink-3" selectable>
                {row.email_guess}{row.email_confidence ? ` · ${row.email_confidence}` : ""}
                {company?.pattern ? ` · ${company.pattern_votes} of ${company.pattern_sources} sources` : ""}
              </Text> : null}
            </Stack>
            <LinkOut label="Open in LinkedIn" href={row.profile_url} app />
            <Stack gap="2">
              <Text size="sm" tone="ink-3">Works there now?</Text>
              <ToggleGroup label="Works there now?" options={WORKS_THERE} value={row.works_there ?? undefined}
                onValueChange={(value) => save(row, { works_there: value })} onClear={() => save(row, { works_there: null })} />
              <Text size="sm" tone="ink-3">Their role</Text>
              <ToggleGroup label="Their role" options={ROLES} value={row.actual_role ?? undefined}
                onValueChange={(value) => save(row, { actual_role: value })} onClear={() => save(row, { actual_role: null })} />
            </Stack>
          </Entry>;
        })}
      </Entries>
      {total > shown ? <Button onPress={() => setShown(shown + PAGE)}>Show {Math.min(PAGE, total - shown)} more</Button> : null}
    </Stack>
  </Screen>;
}

const styles = StyleSheet.create((theme) => ({
  card: { padding: theme.space["4"], borderRadius: theme.radius.lg, borderCurve: "continuous", backgroundColor: theme.colors["bg-elev"] },
}));
