import { readableCode } from "@pinkslip/core/admin-format";
import type {
  ActualRole, ClassificationDisagreement, ClassificationVerdict, Company, ContentReport, FeedbackSubmission, FetchRun, JobReview, PollTierLatency, ProductMetrics,
  RecruiterCandidate, RecruiterCompany, RecruiterCompanyChoice, WorksThere,
} from "@pinkslip/core/api";
import { companySourceLabel } from "@pinkslip/domain/company-sources";
import { MAIL_TEMPLATES, templateLabel } from "@pinkslip/domain/recruiter-review";
import { useState } from "react";
import { ActionSheetIOS, Alert, Pressable, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import {
  Button, Chip, Choice, ChoiceLink, Choices, CompanyLogo, EmptyState, Icon, IconTile, JobRow, ListGroup, ListItem, PageBarButton, PageBarNote, Radio,
  SearchField, SectionHeader, Segmented, SheetHeader, SheetScroll, SheetStep, SwipeRow, Text, TextField, useSheet,
  type IconName,
  type SwipeAction,
} from "../../../ui";
import { logoUri } from "../../jobs/CompanyLogo";
import { JobIdentity } from "../JobIdentity";
import { YouPage } from "../you/Page";
import {
  ago, callWord, companySearchLine, failingSources, flagReasons, jevDifferences, recruiterEmail, recruiterFacts, rowAge, runLength, shortDate, sourceProblem,
  sourceStatus, tierRow, writeAddress,
  type Health,
  type NeedsYouRow,
} from "./admin-facts";

/**
 * Admin on the redesign's kit (owner, 2026-10-16, Paper "Admin · Oct 16"
 * A1–A7): fewer numbers per screen, the thing to do as a verb, one decision
 * at a time. These views take their data as props, so the live screens and
 * the kit's samples share them.
 */

const capital = (text: string) => text.replace(/^./, (letter) => letter.toUpperCase());
const domainOf = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return undefined; } };

/** The one box on Home and Runs: a few big numbers and, on Home, how the last run went. */
function NumbersCard({ label, numbers, line }: { label: string; numbers: [string, string][]; line?: { health: Health; text: string } | null }) {
  const { theme } = useUnistyles();
  const dot = line?.health === "bad" ? theme.ui.color.bad : line?.health === "good" ? theme.ui.color.good : theme.ui.color["ink-4"];
  return <View style={styles.gutter}>
    <View style={styles.card}>
      <Text role="footnote" tone="ink-3">{label}</Text>
      <View style={styles.numbers}>
        {numbers.map(([value, caption]) => <View key={caption} style={styles.number}>
          <Text role="title1">{value}</Text>
          <Text role="footnote" tone="ink-2">{caption}</Text>
        </View>)}
      </View>
      {line ? <>
        <View style={styles.rule} />
        <View style={styles.runLine}>
          <View style={[styles.dot, { backgroundColor: dot }]} />
          <Text role="subhead" tone="ink-2" flex lines={1}>{line.text}</Text>
        </View>
      </> : null}
    </View>
  </View>;
}

const NEEDS_ICONS: Record<NeedsYouRow["id"], IconName> = {
  sources: "companies", flagged: "flagged", feedback: "help", reports: "report", jev: "jev", recruiters: "recruiter",
};

export type AdminTool = "runs" | "sources" | "health" | "jev" | "recruiters";

/** A1: what needs you, then the tools. */
export function AdminHomeView({ day, line, rows, tools, onOpen }: {
  day: { newJobs: number; alerts: number; runs: number };
  line: { health: Health; text: string } | null;
  rows: NeedsYouRow[];
  tools: Record<AdminTool, string | undefined>;
  onOpen: (id: NeedsYouRow["id"] | AdminTool) => void;
}) {
  return <YouPage title="Admin">
    <NumbersCard label="Last 24 hours" line={line}
      numbers={[[day.newJobs.toLocaleString(), "new jobs"], [day.alerts.toLocaleString(), "alerts"], [String(day.runs), "runs"]]} />
    {rows.length > 0
      ? <ListGroup header="Needs you" count={rows.length} needsYou surface="fill" inset="leading">
        {rows.map((row) => <ListItem key={row.id} headline title={row.title} detail={row.detail} accessory="chevron"
          leading={<IconTile icon={NEEDS_ICONS[row.id]} meaning="app" />} onPress={() => onOpen(row.id)} />)}
      </ListGroup>
      : <View style={styles.gutterText}><Text tone="ink-2">Nothing needs you.</Text></View>}
    <ListGroup header="Tools" surface="fill" inset="leading">
      <ListItem title="Runs" value={tools.runs} accessory="chevron" leading={<IconTile icon="runs" meaning="app" />} onPress={() => onOpen("runs")} />
      <ListItem title="Sources" value={tools.sources} accessory="chevron" leading={<IconTile icon="companies" meaning="app" />} onPress={() => onOpen("sources")} />
      <ListItem title="Product health" value={tools.health} accessory="chevron" leading={<IconTile icon="stats" meaning="app" />} onPress={() => onOpen("health")} />
      <ListItem title="Jev" value={tools.jev} accessory="chevron" leading={<IconTile icon="jev" meaning="app" />} onPress={() => onOpen("jev")} />
      <ListItem title="Recruiters" value={tools.recruiters} accessory="chevron" leading={<IconTile icon="recruiter" meaning="app" />} onPress={() => onOpen("recruiters")} />
    </ListGroup>
  </YouPage>;
}

/** One entry in an inbox list (A2): the job row, swiped right to approve and left to turn down. */
export interface InboxRow {
  id: string;
  company: string;
  domain?: string;
  title: string;
  facts: string;
  age: string;
}

export function InboxListView({ title, rows, approve, reject, empty, onOpen, onApprove, onReject, footer }: {
  title: string;
  rows: InboxRow[];
  approve: string;
  reject: string;
  empty: string;
  onOpen: (id: string) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  footer?: React.ReactNode;
}) {
  return <YouPage title={title}>
    {rows.length === 0 ? <View style={styles.gutterText}><Text tone="ink-2">{empty}</Text></View> : <View style={styles.bleed}>
      {rows.map((row) => {
        const leading: SwipeAction[] = [{ id: "approve", label: approve, icon: "done", tone: "apply", removes: true, run: () => onApprove(row.id) }];
        const trailing: SwipeAction[] = [{ id: "reject", label: reject, icon: "remove", tone: "neutral", removes: true, run: () => onReject(row.id) }];
        return <SwipeRow key={row.id} id={row.id} leading={leading} trailing={trailing}>
          <JobRow company={row.company} title={row.title} facts={row.facts} age={row.age} logo={{ name: row.company, uri: logoUri(row.domain) }}
            onPress={() => onOpen(row.id)} actions={[{ id: "approve", label: approve, run: () => onApprove(row.id) }, { id: "reject", label: reject, run: () => onReject(row.id) }]} />
        </SwipeRow>;
      })}
    </View>}
    {footer}
  </YouPage>;
}

/** One entry opened (A3): who and what, why it's here, then the two answers pinned. */
export function DecideView({ company, domain, title, whyHeader, why, body, link, extra, position, total, reject, approve, onReject, onApprove, note, onNote }: {
  company: string;
  domain?: string;
  title: string;
  whyHeader?: string;
  why: [string, string][];
  body?: string;
  link?: { label: string; onPress: () => void };
  extra?: { label: string; onPress: () => void };
  position: number;
  total: number;
  reject: string;
  approve: string;
  onReject: () => void;
  onApprove: () => void;
  note?: string;
  onNote?: () => void;
}) {
  return <YouPage title="" action={<PageBarNote><Text role="subhead" tone="ink-3">{`${position} of ${total}`}</Text></PageBarNote>}
    bar={<View style={styles.pair}>
      <Button onPress={onReject}>{reject}</Button>
      <View style={styles.flex}><Button variant="primary" fullWidth onPress={onApprove}>{approve}</Button></View>
    </View>}>
    <View style={styles.gutter}><JobIdentity companyName={company} companyDomain={domain} title={title} /></View>
    {why.length > 0 ? <ListGroup header={whyHeader} surface="fill">
      {/* A long value goes under its label, so neither squeezes the other. */}
      {why.map(([label, value]) => value.length > 18
        ? <ListItem key={label} title={label} detail={value} />
        : <ListItem key={label} title={label} value={value || undefined} />)}
    </ListGroup> : null}
    {body ? <View style={styles.gutterText}><Text role="longText">{body}</Text></View> : null}
    {link || onNote || extra ? <ListGroup surface="fill">
      {link ? <ListItem title={link.label} trailing={<Icon name="apply" size={16} tone="ink-3" />} onPress={link.onPress} /> : null}
      {extra ? <ListItem title={extra.label} accessory="chevron" onPress={extra.onPress} /> : null}
      {onNote ? <ListItem title={note ? "Note" : "Add a note"} value={note} onPress={onNote} /> : null}
    </ListGroup> : null}
  </YouPage>;
}

/** Asks for a note in the system's own prompt. */
export function askForNote(current: string | undefined, onNote: (note: string) => void) {
  Alert.prompt("Note", "Saved with your decision.", (text) => onNote(text.trim()), "plain-text", current ?? "");
}

/** The flagged job's rows and page, from a review. */
export const flaggedRow = (review: JobReview, now: number): InboxRow => ({
  id: review.job_id, company: review.company_name, title: review.title, facts: flagReasons(review).join(" · "), age: rowAge(review.created_at, now),
});

export const feedbackRow = (item: FeedbackSubmission, now: number): InboxRow => ({
  id: item.id, company: item.user_name || "Someone", title: item.title,
  facts: [item.status === "planned" ? "Planned" : null, readableCode(item.submission_type).replace(/^./, (letter) => letter.toUpperCase())].filter(Boolean).join(" · "),
  age: rowAge(item.created_at, now),
});

export const reportRow = (report: ContentReport, now: number): InboxRow => ({
  id: report.id, company: report.company_name ?? "Unknown company", title: report.job_title ?? "Company report",
  facts: report.notes || readableCode(report.report_type).replace(/^./, (letter) => letter.toUpperCase()), age: rowAge(report.created_at, now),
});

/** A4: one disagreement at a time, only the fields that differ. */
export function JevView({ rows, judged, budget, onJudge }: {
  rows: ClassificationDisagreement[];
  judged: { total: number; rules: number; jev: number; neither: number };
  budget?: { spent: number; of: number };
  onJudge: (row: ClassificationDisagreement, verdict: ClassificationVerdict) => void;
}) {
  const [showSame, setShowSame] = useState(false);
  const row = rows[0];
  const tally = judged.total > 0
    ? `So far you've judged ${judged.total}: rules right ${judged.rules}, Jev right ${judged.jev}, both wrong ${judged.neither}.`
    : "Judge a few to see who's right more often.";
  const spend = budget ? ` $${budget.spent.toFixed(2)} of $${budget.of.toFixed(0)} this month.` : "";
  if (!row) {
    return <YouPage title="Jev">
      <EmptyState title="Nothing to judge" message={`${tally}${spend}`} />
    </YouPage>;
  }
  const { differ, same } = jevDifferences(row);
  const shown = showSame ? row.fields : differ;
  return <YouPage title="" action={<PageBarNote><Text role="subhead" tone="ink-3">{`1 of ${rows.length}`}</Text></PageBarNote>}
    bar={<View style={styles.verdicts}>
      <View style={styles.pair}>
        <View style={styles.flex}><Button fullWidth onPress={() => { setShowSame(false); onJudge(row, "rules"); }}>Rules right</Button></View>
        <View style={styles.flex}><Button fullWidth onPress={() => { setShowSame(false); onJudge(row, "jev"); }}>Jev right</Button></View>
      </View>
      <View style={styles.pair}>
        <View style={styles.flex}><Button variant="plain" fullWidth onPress={() => { setShowSame(false); onJudge(row, "neither"); }}>Both wrong</Button></View>
        <View style={styles.flex}><Button variant="plain" fullWidth onPress={() => { setShowSame(false); onJudge(row, "unclear"); }}>Not sure</Button></View>
      </View>
    </View>}>
    <View style={styles.gutter}><JobIdentity companyName={row.company} title={row.title ?? "Untitled listing"} /></View>
    <View style={styles.gutter}>
      <View style={styles.compare}>
        <View style={styles.compareHead}>
          <View style={styles.compareLabel} />
          <Text role="footnote" weight="medium" tone="ink-2" flex>Rules</Text>
          <Text role="footnote" weight="medium" tone="ink-2" flex>Jev</Text>
        </View>
        <CompareRow label="Call" rules={callWord(row.rules.decision)} jev={callWord(row.jev.decision)} strong />
        {shown.map((field) => <CompareRow key={field.field} label={field.label} rules={capital(readableCode(field.rules))}
          jev={`${capital(readableCode(field.jev))}${field.confidence === null ? "" : ` · ${Math.round(field.confidence * 100)}%`}`} />)}
        {same > 0 ? <Pressable onPress={() => setShowSame(!showSame)} accessibilityRole="button" style={styles.compareMore}>
          <Text tone="ink-3" flex>{showSame ? "Show only the differences" : `Same on ${same} more`}</Text>
          <Icon name="pick" size={12} tone="ink-4" />
        </Pressable> : null}
      </View>
    </View>
    {row.truncated ? <View style={styles.gutterText}><Text role="footnote" tone="ink-3">Jev only saw the first 12,000 characters of this posting.</Text></View> : null}
    <View style={styles.gutterText}><Text role="footnote" tone="ink-3">{`${tally}${spend}`}</Text></View>
  </YouPage>;
}

const WORKS_THERE: { value: WorksThere; label: string }[] = [
  { value: "yes", label: "Yes" }, { value: "no", label: "No" }, { value: "unsure", label: "Not sure" },
];
const ROLES: { value: ActualRole; label: string }[] = [
  { value: "early_career", label: "Early-career" }, { value: "other_recruiter", label: "Other recruiter" }, { value: "not_recruiter", label: "Not a recruiter" },
];

/** A7, Recruiters (Paper "Admin · Oct 16", note 7: Jev's pattern): one
 * person at a time, what the search made of them, and the two questions
 * pinned where Jev's verdicts are. With both answered the next person comes
 * up; Skip sends them to the back (Paper "Recruiters · Skip and the company
 * · Oct 19", R1). The top line names the company and its site, so "Works
 * there now?" means that company; an address that isn't at the site is
 * flagged (R2), and tapping Email opens the company's format (R4). Someone
 * labelled "works there" goes on the company's People. */
export function RecruitersView({ queue, tally, canRun, companies, onLabel, onSkip, onChoose, onFormat, onOpenProfile }: {
  queue: RecruiterCandidate[];
  tally: string;
  canRun: boolean;
  /** The sourcing runs, by company id: its site, format and where that came from. */
  companies: Map<string, RecruiterCompany>;
  onLabel: (row: RecruiterCandidate, labels: { works_there?: WorksThere; actual_role?: ActualRole }) => void;
  onSkip: (row: RecruiterCandidate) => void;
  onChoose: () => void;
  onFormat: (row: RecruiterCandidate) => void;
  onOpenProfile: (row: RecruiterCandidate) => void;
}) {
  const row = queue[0];
  const choose = <PageBarButton icon="add" label="Choose companies" onPress={onChoose} />;
  if (!row) {
    return <YouPage title="Recruiters" action={canRun ? choose : undefined}>
      <EmptyState title="Nobody to label" message={canRun ? tally : "Set SERPER_API_KEY on the Worker to search."}
        action={canRun ? { label: "Choose companies", onPress: onChoose } : undefined} />
    </YouPage>;
  }
  const company = companies.get(row.company_id);
  const email = recruiterEmail(row, company);
  return <YouPage title="" action={<>
    <PageBarNote><Text role="subhead" tone="ink-3">{`1 of ${queue.length}`}</Text></PageBarNote>
    {canRun ? choose : null}
  </>}
    bar={<View style={styles.questions}>
      <View style={styles.question}>
        <Text role="footnote" weight="medium" tone="ink-2">Works there now?</Text>
        <Segmented value={row.works_there} onChange={(value) => onLabel(row, { works_there: value })} segments={WORKS_THERE} />
      </View>
      <View style={styles.question}>
        <Text role="footnote" weight="medium" tone="ink-2">Their role</Text>
        <Segmented value={row.actual_role} onChange={(value) => onLabel(row, { actual_role: value })} segments={ROLES} />
      </View>
      <Button variant="plain" fullWidth onPress={() => onSkip(row)}>Skip</Button>
    </View>}>
    <View style={styles.gutter}>
      <JobIdentity companyName={[row.company, company?.site].filter(Boolean).join(" · ")} companyDomain={company?.site} title={row.name} />
    </View>
    <ListGroup surface="fill">
      {/* A long value goes under its label, as on the flagged job's page. */}
      {recruiterFacts(row).map(([label, value]) => value.length > 18
        ? <ListItem key={label} title={label} detail={value} />
        : <ListItem key={label} title={label} value={value} />)}
      <EmailRow detail={email.detail} warning={email.warning} onPress={() => onFormat(row)} />
    </ListGroup>
    <ListGroup surface="fill" footer="Turn on private mode in LinkedIn first, or people see that you viewed them.">
      <ListItem title="Open in LinkedIn" trailing={<Icon name="apply" size={16} tone="ink-3" />} onPress={() => onOpenProfile(row)} />
    </ListGroup>
    <View style={styles.gutterText}><Text role="footnote" tone="ink-3">{tally}</Text></View>
  </YouPage>;
}

/** R1's Email row: the guess and its trust, a chevron to the company's
 * format, and R2's warning (the kit's field that's wrong: the label and one
 * line in `bad`). */
function EmailRow({ detail, warning, onPress }: { detail: string; warning: string | null; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={["Email", detail, warning].filter(Boolean).join(", ")}
    style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}>
    <View style={styles.flex}>
      <Text tone={warning ? "bad" : "ink"}>Email</Text>
      <Text role="subhead" tone="ink-3">{detail}</Text>
      {warning ? <Text role="subhead" tone="bad">{warning}</Text> : null}
    </View>
    <Icon name="disclosure" size={12} tone="ink-4" />
  </Pressable>;
}

export type CompanyPickFilter = "hiring" | "not_searched" | "has_format";

/** R3, Choose companies (Paper "Recruiters · Skip and the company · Oct 19"):
 * Jobs' select pattern for the catalog, most open jobs first; each row says
 * when it was searched and its format. "Search 3 companies" is pinned. */
export function ChooseCompaniesView({ companies, query, filter, picked, searching, onQuery, onFilter, onToggle, onSearch }: {
  companies: RecruiterCompanyChoice[];
  query: string;
  filter: CompanyPickFilter | undefined;
  picked: Set<string>;
  searching: boolean;
  onQuery: (text: string) => void;
  onFilter: (filter: CompanyPickFilter | undefined) => void;
  onToggle: (company: RecruiterCompanyChoice) => void;
  onSearch: () => void;
}) {
  const count = picked.size;
  const chip = (label: string, value: CompanyPickFilter) =>
    <Chip label={label} selected={filter === value} onPress={() => onFilter(filter === value ? undefined : value)} />;
  return <YouPage title={count > 0 ? `${count} selected` : "Choose companies"}
    bar={<Button variant="primary" fullWidth disabled={count === 0} pending={searching} onPress={onSearch}>
      {count === 0 ? "Search companies" : count === 1 ? "Search 1 company" : `Search ${count} companies`}
    </Button>}>
    <View style={styles.searchBlock}>
      <SearchField value={query} onChangeText={onQuery} placeholder="Search companies" />
    </View>
    {/* As Jobs' quick filters: they scroll sideways rather than crowd the margin. */}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipStrip}>
      {chip("Hiring now", "hiring")}
      {chip("Not searched", "not_searched")}
      {chip("Has a format", "has_format")}
    </ScrollView>
    {companies.length === 0 ? <View style={styles.gutterText}><Text tone="ink-2">No companies match.</Text></View> : <View style={styles.bleed}>
      <SectionHeader title="Most open jobs first" count={companies.length} first />
      {companies.map((company) => <View key={company.id} style={styles.pickRow}>
        <Pressable onPress={() => onToggle(company)} accessibilityRole="checkbox" accessibilityState={{ checked: picked.has(company.id) }}
          accessibilityLabel={company.name} hitSlop={8} style={styles.pick}>
          <Radio selected={picked.has(company.id)} />
        </Pressable>
        <View style={styles.flex}>
          <JobRow headline="company" company={company.name} title={`${company.site} · ${company.open_jobs === 1 ? "1 open job" : `${company.open_jobs} open jobs`}`}
            facts={companySearchLine(company)} logo={{ name: company.name, uri: logoUri(company.site) }} onPress={() => onToggle(company)} />
        </View>
      </View>)}
    </View>}
  </YouPage>;
}

/** R4, a company's email format: the domain, the common formats written out
 * with the person's name, Hunter to look it up, and what GitHub and the
 * format pages say. Saving rewrites every guess there. */
export function RecruiterFormatSheet({ companyName, initialDomain, initialTemplate, sampleName, evidence, onLookUp, onSave }: {
  companyName: string;
  initialDomain: string;
  initialTemplate: string | null;
  /** First and last name to show each format with ("dana.whitfield@"). */
  sampleName: { first: string; last: string };
  /** "GitHub: 4 addresses, all first.last. Format pages: first.last, 6 of 7." */
  evidence: string | null;
  onLookUp: (domain: string) => void;
  /** Resolves once saved; the sheet then closes. */
  onSave: (domain: string, template: string) => Promise<void>;
}) {
  const sheet = useSheet();
  const [saving, setSaving] = useState(false);
  const [domain, setDomain] = useState(initialDomain);
  const [template, setTemplate] = useState(initialTemplate ?? MAIL_TEMPLATES[0]);
  const [more, setMore] = useState(() => initialTemplate !== null && MAIL_TEMPLATES.indexOf(initialTemplate as (typeof MAIL_TEMPLATES)[number]) > 3);
  const shown = more ? MAIL_TEMPLATES : MAIL_TEMPLATES.slice(0, 4);
  const host = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return <SheetStep id="format">
    <View style={styles.sheetHeading}>
      <SheetHeader title={`${companyName}'s email format`} />
      <Text role="subhead" tone="ink-2">Every address there is written from it.</Text>
    </View>
    {/* All nine formats are taller than the screen: the middle scrolls, Save stays. */}
    <SheetScroll style={styles.sheetScroll} contentContainerStyle={styles.sheetScrollBody}>
      <Choices><TextField label="Domain" value={domain} onChangeText={setDomain} keyboardType="url" /></Choices>
      <Choices>
        {[...shown.map((option) => <Choice key={option} plain title={templateLabel(option)} detail={`${writeAddress(option, sampleName)}@${host || "…"}`}
          selected={template === option} onPress={() => setTemplate(option)} />),
        ...(more ? [] : [<ChoiceLink key="more" title="More formats" onPress={() => setMore(true)} />])]}
      </Choices>
      <View style={styles.sheetLookUp}>
        <Choices><ChoiceLinkOut title="Look it up on Hunter" onPress={() => onLookUp(host)} /></Choices>
        {evidence ? <View style={styles.sheetNote}><Text role="footnote" tone="ink-3">{evidence}</Text></View> : null}
      </View>
    </SheetScroll>
    <Button variant="primary" fullWidth disabled={!host.includes(".")} pending={saving} onPress={() => {
      setSaving(true);
      onSave(host, template).then(() => sheet.close(), () => setSaving(false));
    }}>Save</Button>
  </SheetStep>;
}

/** A sheet row that leaves Pinkslip: the title, then ↗. */
function ChoiceLinkOut({ title, onPress }: { title: string; onPress: () => void }) {
  return <Pressable onPress={onPress} accessibilityRole="link" style={({ pressed }) => [styles.linkOut, pressed && styles.pressedSoft]}>
    <Text flex>{title}</Text>
    <Icon name="apply" size={16} tone="ink-3" />
  </Pressable>;
}


function CompareRow({ label, rules, jev, strong }: { label: string; rules: string; jev: string; strong?: boolean }) {
  return <View style={styles.compareRow}>
    <View style={styles.compareLabel}><Text tone="ink-3" lines={1}>{label}</Text></View>
    <Text weight={strong ? "medium" : "regular"} flex lines={2}>{rules}</Text>
    <Text weight={strong ? "medium" : "regular"} flex lines={2}>{jev}</Text>
  </View>;
}

/** A5: the last run in numbers, what's failing, how fast alerts go out. */
export function RunsView({ runs, tiers, companies, now, refreshing, onRefresh, onOpenSource }: {
  runs: FetchRun[];
  tiers: PollTierLatency[];
  companies: Company[];
  now: number;
  refreshing?: string | null;
  onRefresh: () => void;
  onOpenSource: (company: Company) => void;
}) {
  const { theme } = useUnistyles();
  const [earlier, setEarlier] = useState(false);
  const latest = runs[0];
  const failing = failingSources(companies);
  const today = runs.filter((run) => now - new Date(run.started_at).getTime() < 86_400_000).length;
  return <YouPage title="Runs" action={<PageBarButton icon="runs" label="Refresh every source" onPress={onRefresh} />}>
    {refreshing ? <View style={styles.gutterText}><Text role="subhead" tone="ink-2">{refreshing}</Text></View> : null}
    {latest ? <NumbersCard label={`Last run · ${ago(latest.started_at, now)}`} numbers={[
      [String(latest.new_jobs_found), "new jobs"],
      [String(latest.companies_succeeded), `of ${latest.companies_attempted}`],
      [runLength(latest.duration_ms), "to run"],
      [latest.notifications_sent.toLocaleString(), "alerts"],
    ]} /> : null}
    {failing.length > 0 ? <ListGroup header="Failing now" count={failing.length} surface="fill" inset="leading">
      {failing.map((company) => <ListItem key={company.id} headline title={company.name} detail={sourceProblem(company)} accessory="chevron"
        leading={<CompanyLogo name={company.name} uri={logoUri(domainOf(company.website))} size="stack" />} onPress={() => onOpenSource(company)} />)}
    </ListGroup> : null}
    {tiers.length > 0 ? <ListGroup header="Alert speed · worst case" surface="fill">
      {tiers.map((tier) => {
        const row = tierRow(tier);
        return <ListItem key={tier.tier} title={row.label} value={row.value}
          trailing={<View style={[styles.dot, { backgroundColor: row.bad ? theme.ui.color.bad : theme.ui.color.good }]} />} />;
      })}
    </ListGroup> : null}
    <ListGroup surface="fill">
      <ListItem title="Earlier runs" value={`${today} today`} accessory="pick" onPress={() => setEarlier(!earlier)} />
      {earlier ? runs.slice(1, 13).map((run) => <ListItem key={run.id}
        title={new Date(run.started_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        detail={run.companies_failed > 0 ? `${run.companies_failed} failed` : undefined} inline
        value={`${run.new_jobs_found} new`}
        trailing={<View style={[styles.dot, { backgroundColor: run.status === "error" || run.companies_failed > 0 ? theme.ui.color.bad : theme.ui.color.good }]} />} />) : []}
    </ListGroup>
  </YouPage>;
}

type SourceFilter = "all" | "attention" | "off";
const PAGE = 40;

/** A6: every source in the same three lines; hold one for Turn off, Edit, Remove. */
export function SourcesView({ companies, now, onAdd, onEdit, onToggle, onRemove, initialFilter = "all" }: {
  companies: Company[];
  now: number;
  onAdd: () => void;
  onEdit: (company: Company) => void;
  onToggle: (company: Company, enabled: boolean) => void;
  onRemove: (company: Company) => void;
  initialFilter?: SourceFilter;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SourceFilter>(initialFilter);
  const [limit, setLimit] = useState(PAGE);
  const q = query.trim().toLowerCase();
  const attention = failingSources(companies);
  const off = companies.filter((company) => !company.enabled);
  const base = filter === "attention" ? attention : filter === "off" ? off : [...attention, ...companies.filter((company) => !attention.includes(company))];
  const shown = base.filter((company) => !q || company.name.toLowerCase().includes(q) || company.ats_slug.toLowerCase().includes(q)
    || companySourceLabel(company.ats_type).toLowerCase().includes(q));
  const hold = (company: Company) => ActionSheetIOS.showActionSheetWithOptions({
    title: company.name,
    options: [company.enabled ? "Turn off" : "Turn on", "Edit", "Remove", "Cancel"],
    destructiveButtonIndex: 2, cancelButtonIndex: 3,
  }, (index) => {
    if (index === 0) onToggle(company, !company.enabled);
    if (index === 1) onEdit(company);
    if (index === 2) onRemove(company);
  });
  return <YouPage title="Sources" action={<PageBarButton icon="add" label="Add a source" onPress={onAdd} />}>
    <View style={styles.searchBlock}>
      <SearchField value={query} onChangeText={(text) => { setQuery(text); setLimit(PAGE); }} placeholder="Search sources" />
      <View style={styles.chips}>
        <Chip label="All" selected={filter === "all"} onPress={() => { setFilter("all"); setLimit(PAGE); }} />
        <Chip label="Needs attention" count={attention.length} selected={filter === "attention"} onPress={() => { setFilter("attention"); setLimit(PAGE); }} />
        <Chip label="Off" count={off.length} selected={filter === "off"} onPress={() => { setFilter("off"); setLimit(PAGE); }} />
      </View>
    </View>
    {shown.length === 0 ? <View style={styles.gutterText}><Text tone="ink-2">No sources match.</Text></View> : <View style={styles.bleed}>
      {shown.slice(0, limit).map((company) => {
        const status = sourceStatus(company, now);
        return <JobRow key={company.id} company={company.name} title={`${companySourceLabel(company.ats_type)} · ${company.ats_slug}`} facts={status.text}
          factsBad={status.tone === "bad"} quiet={status.tone === "quiet"} logo={{ name: company.name, uri: logoUri(domainOf(company.website)) }}
          onPress={() => onEdit(company)} onLongPress={() => hold(company)}
          actions={[{ id: "toggle", label: company.enabled ? "Turn off" : "Turn on", run: () => onToggle(company, !company.enabled) }, { id: "remove", label: "Remove", run: () => onRemove(company) }]} />;
      })}
    </View>}
    {shown.length > limit ? <View style={styles.gutter}><Button fullWidth onPress={() => setLimit(limit + PAGE)}>{`Show ${Math.min(PAGE, shown.length - limit)} more`}</Button></View> : null}
  </YouPage>;
}

/** A7: the period's health as numbers, in plain words. Tailoring stays out while it's on hold. */
export function HealthView({ metrics }: { metrics: ProductMetrics }) {
  const minutes = Math.round(metrics.notification_latency_seconds / 60);
  const groups: { title: string; numbers: [string, string][] }[] = [
    { title: "Alerts", numbers: [
      [minutes < 1 ? `${Math.round(metrics.notification_latency_seconds)} sec` : `${minutes} min`, "from job to alert"],
      [`${metrics.notification_open_rate}%`, "opened"],
      [metrics.notifications_sent.toLocaleString(), "sent"],
      [metrics.push_registrations.toLocaleString(), "phones signed up"],
    ] },
    { title: "Searches", numbers: [
      [metrics.total_profiles ? `${Math.round((metrics.users_with_enough_matches / metrics.total_profiles) * 100)}%` : "—", "find enough jobs"],
      [`${metrics.onboarding_completion_rate}%`, "finish onboarding"],
      [`${metrics.eligible_job_dismissal_rate}%`, "hide jobs that fit"],
      [String(metrics.profile_adjustments), "searches changed"],
    ] },
    { title: "Applying", numbers: [
      [String(metrics.apply_clicks_within_one_hour), "applied within an hour"],
      [String(metrics.accounts_created), "new accounts"],
    ] },
  ];
  return <YouPage title="Product health">
    <View style={styles.subtitle}><Text role="subhead" tone="ink-3">{`Last ${metrics.period_days} days`}</Text></View>
    {groups.map((group, index) => <View key={group.title} style={styles.healthGroup}>
      {index > 0 ? <View style={styles.rule} /> : null}
      <Text role="footnote" weight="medium" tone="ink-2">{group.title}</Text>
      <View style={styles.grid}>
        {group.numbers.map(([value, caption]) => <View key={caption} style={styles.half}>
          <Text role="title1">{value}</Text>
          <Text role="footnote" tone="ink-2">{caption}</Text>
        </View>)}
      </View>
    </View>)}
    <View style={styles.gutter}><Text role="footnote" tone="ink-3">Tailoring is on hold, so its numbers are hidden.</Text></View>
  </YouPage>;
}

export { shortDate };

const styles = StyleSheet.create((theme) => ({
  flex: { flex: 1 },
  gutter: { paddingHorizontal: theme.ui.size.gutter },
  gutterText: { paddingHorizontal: theme.ui.size.gutter + theme.ui.space["4"] },
  // Right under the title, as a page's subtitle.
  subtitle: { paddingHorizontal: theme.ui.size.gutter, marginTop: -theme.ui.space["5"] },
  bleed: { marginTop: -theme.ui.space["2"] },
  card: { gap: theme.ui.space["3"], padding: theme.ui.space["4"], borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-grouped"] },
  numbers: { flexDirection: "row" },
  number: { flex: 1 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: theme.ui.color.separator },
  runLine: { flexDirection: "row", alignItems: "center", gap: theme.ui.space["2"] },
  dot: { width: 8, height: 8, borderRadius: 4 },
  pair: { flexDirection: "row", gap: theme.ui.space["3"] },
  questions: { gap: theme.ui.space["3"] },
  // R1's Email row, as a list row draws itself (ui/List.tsx).
  listRow: {
    minHeight: theme.ui.size.listRow, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"],
    paddingHorizontal: theme.ui.space["4"], paddingVertical: theme.ui.space["2"],
  },
  pressed: { backgroundColor: theme.ui.color.fill },
  pressedSoft: { opacity: 0.6 },
  // R3: the selection circle before the logo, level with it (Jobs' select).
  pickRow: { flexDirection: "row", backgroundColor: theme.ui.color.bg },
  pick: {
    width: theme.ui.space["4"] + theme.ui.size.hole, paddingLeft: theme.ui.space["4"],
    paddingTop: (theme.ui.size.jobRow - theme.ui.type.subhead.line * 3) / 2 + (40 - theme.ui.size.hole) / 2,
  },
  sheetHeading: { gap: theme.ui.space["1"] },
  // As Edit search's lists scroll: to the sheet's edges, the groups back on its padding.
  sheetScroll: { flexShrink: 1, marginHorizontal: -theme.ui.space["5"] },
  sheetScrollBody: { gap: theme.ui.space["5"], paddingHorizontal: theme.ui.space["5"], paddingBottom: theme.ui.space["1"] },
  sheetLookUp: { gap: theme.ui.space["2"] },
  sheetNote: { paddingHorizontal: theme.ui.space["4"] },
  linkOut: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: theme.ui.space["2"] },
  question: { gap: theme.ui.space["2"] },
  verdicts: { gap: theme.ui.space["1"] },
  compare: { paddingHorizontal: theme.ui.space["4"], borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-grouped"] },
  compareHead: { flexDirection: "row", alignItems: "center", minHeight: 40, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.ui.color.separator },
  compareRow: { flexDirection: "row", alignItems: "center", minHeight: 50, gap: theme.ui.space["2"], borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.ui.color.separator },
  compareLabel: { width: 84 },
  compareMore: { flexDirection: "row", alignItems: "center", minHeight: 50, gap: theme.ui.space["3"] },
  searchBlock: { gap: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter },
  chips: { flexDirection: "row", gap: theme.ui.space["2"] },
  chipScroll: { flexGrow: 0, marginTop: -theme.ui.space["3"] },
  chipStrip: { gap: theme.ui.space["2"], paddingHorizontal: theme.ui.size.gutter },
  healthGroup: { gap: theme.ui.space["3"], paddingHorizontal: theme.ui.size.gutter },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: theme.ui.space["4"] },
  half: { width: "50%" },
}));
