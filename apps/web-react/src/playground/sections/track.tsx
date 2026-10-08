import type { Job } from "@pinkslip/core/api";
import { formatRowLocation, formatRowSalary } from "@pinkslip/core/job-format";
import { timeAgo } from "@pinkslip/core/utils";
import { Button } from "@pinkslip/ui/button";
import { Badge, type BadgeTone } from "@pinkslip/ui/display";
import { SearchInput } from "@pinkslip/ui/field";
import { BookmarkIcon, CheckIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, MoreIcon, ShareIcon } from "@pinkslip/ui/icons";
import { cn } from "@pinkslip/ui/lib/cn";
import { Drawer, DrawerHandle } from "@pinkslip/ui/overlay";
import { Chip, Segment, Segmented } from "@pinkslip/ui/toggle";
import { useState, type ReactNode } from "react";
import { CompanyMark } from "../../components/company-mark";
import { JobListItem } from "../../components/job-list";
import { JobRow } from "../../components/job-row";
import { sampleJobs } from "../data";
import { Group } from "../specimen";

/* Track, round 2: the picks. A list filtered by stage chips, rows that name
   the stage, the job beside the list on a wide screen, a funnel of the
   season that can switch to a flow chart, and a job page whose history is a
   tab that opens first once you've applied. Mock data only: the real Track
   replaces this file once it's approved. */

/* ------------------------------------------------------------ Mock data */

const DAY = 86_400_000;

/** A moment `days` from now (negative is the past), at a set clock time. */
function at(days: number, hour = 9, minute = 0) {
  const date = new Date(Date.now() + days * DAY);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function job(id: string, company: string, title: string, location: string, salary: string | null, postedDays = 3): Job {
  return {
    ...sampleJobs[0]!,
    id,
    external_id: id,
    company_id: `company-${id}`,
    company_name: company,
    title,
    location,
    salary,
    posted_at: at(-postedDays, 8),
    first_seen_at: at(-postedDays, 8),
    saved: false,
    closed_at: null,
  };
}

type Stage = "saved" | "applied" | "assessment" | "interviewing" | "offer" | "closed";

const stageLabel: Record<Stage, string> = {
  saved: "Saved",
  applied: "Applied",
  assessment: "Assessment",
  interviewing: "Interviewing",
  offer: "Offer",
  closed: "Closed",
};

const stageTone: Record<Stage, BadgeTone> = {
  saved: "neutral",
  applied: "neutral",
  assessment: "accent",
  interviewing: "accent",
  offer: "good",
  closed: "neutral",
};

/** The bar's main button follows the stage. */
const stageAction: Partial<Record<Stage, string>> = {
  assessment: "Open assessment",
  interviewing: "Add to calendar",
  offer: "View offer",
};

/** The next thing with a date: a deadline, an interview, a follow-up. */
interface Step {
  label: string;
  at: string;
  /** Show the clock time, for interviews. */
  time?: boolean;
}

/** Something that happened. Email and outreach are just more kinds. */
interface TrackEvent {
  at: string;
  title: string;
  detail?: string;
  source?: "email" | "you" | "pinkslip";
  key?: boolean;
}

interface Person {
  name: string;
  role: string;
  status: string;
  action: string;
}

interface Item {
  job: Job;
  stage: Stage;
  outcome?: string;
  /** When it entered its current stage. */
  since: string;
  next?: Step;
  events: TrackEvent[];
  people?: Person[];
}

const saved = (item: Omit<Item, "stage" | "events">): Item => ({
  ...item,
  job: { ...item.job, saved: true },
  stage: "saved",
  events: [{ at: item.since, title: "Saved", source: "you" }],
});

const items: Item[] = [
  {
    job: job("t-ramp", "Ramp", "Software Engineer, New Grad", "New York, NY", "$160,000 - $190,000", 9),
    stage: "assessment",
    since: at(-4, 10),
    next: { label: "Assessment due", at: at(3, 23, 59) },
    events: [
      { at: at(-4, 10, 12), title: "Assessment invite", detail: "CodeSignal, 70 minutes", source: "email", key: true },
      { at: at(-8, 9, 30), title: "Applied with Auto apply", detail: "Resume tailored for Ramp", source: "pinkslip", key: true },
      { at: at(-9, 21), title: "Saved", source: "you" },
    ],
  },
  {
    job: job("t-stripe", "Stripe", "Software Engineer, New Grad", "San Francisco, CA | New York, NY", "$165,000 - $200,000", 20),
    stage: "interviewing",
    since: at(-2, 15),
    next: { label: "Phone screen", at: at(5, 14), time: true },
    events: [
      { at: at(-2, 15, 4), title: "Phone screen scheduled", detail: "With Maya Chen, 45 minutes", source: "email", key: true },
      { at: at(-8, 18, 40), title: "Assessment submitted", source: "you" },
      { at: at(-11, 11, 2), title: "Assessment invite", detail: "HackerRank, due in 7 days", source: "email", key: true },
      { at: at(-14, 8, 15), title: "Emailed Maya Chen", detail: "Recruiter at Stripe", source: "you" },
      { at: at(-15, 9), title: "Applied", detail: "On stripe.com", source: "you", key: true },
      { at: at(-16, 20), title: "Saved", source: "you" },
    ],
    people: [
      { name: "Maya Chen", role: "Recruiter", status: "Replied Oct 1", action: "Email" },
      { name: "Priya Shah", role: "Engineering manager", status: "No reply in 6 days", action: "Follow up" },
    ],
  },
  {
    job: job("t-notion", "Notion", "Software Engineer, Early Career", "San Francisco, CA", "$150,000 - $185,000", 30),
    stage: "interviewing",
    since: at(-6, 12),
    next: { label: "Final round", at: at(1, 10), time: true },
    events: [
      { at: at(-6, 12), title: "Final round scheduled", source: "email", key: true },
      { at: at(-18, 12), title: "Applied", source: "you", key: true },
    ],
  },
  {
    job: job("t-datadog", "Datadog", "Backend Engineer, Graduate", "New York, NY", "$150,000 - $175,000", 45),
    stage: "offer",
    since: at(-3, 16),
    next: { label: "Offer expires", at: at(12, 17) },
    events: [
      { at: at(-3, 16), title: "Offer", detail: "$165K base", source: "email", key: true },
      { at: at(-30, 12), title: "Applied", source: "you", key: true },
    ],
  },
  {
    job: job("t-figma", "Figma", "Software Engineer, Early Career", "San Francisco, CA", "$148,000 - $182,000", 12),
    stage: "applied",
    since: at(-10, 9),
    next: { label: "Follow up with Sam Ortiz", at: at(0, 18) },
    events: [
      { at: at(-5, 10), title: "Emailed Sam Ortiz", detail: "Engineering manager", source: "you" },
      { at: at(-10, 9), title: "Applied", source: "you", key: true },
    ],
    people: [{ name: "Sam Ortiz", role: "Engineering manager", status: "No reply in 5 days", action: "Follow up" }],
  },
  saved({ job: job("t-linear", "Linear", "Product Engineer, New Grad", "Remote (US)", "$140,000 - $170,000", 0.2), since: at(-0.1, 8) }),
  saved({ job: job("t-vercel", "Vercel", "Software Engineer, Infrastructure", "New York, NY", "$155,000 - $185,000", 1), since: at(-1, 8) }),
  saved({ job: job("t-scale", "Scale AI", "ML Engineer, Early Career", "San Francisco, CA", null, 2), since: at(-2, 8) }),
  { job: job("t-twosigma", "Two Sigma", "Software Engineer, New Grad", "New York, NY", "$175,000 - $200,000", 5), stage: "applied", since: at(-3, 11), events: [{ at: at(-3, 11), title: "Applied", source: "you", key: true }] },
  { job: job("t-coinbase", "Coinbase", "Software Engineer, Backend", "Remote (US)", "$150,000 - $170,000", 8), stage: "applied", since: at(-5, 14), events: [{ at: at(-5, 14), title: "Applied", source: "email", key: true }] },
  { job: job("t-retool", "Retool", "Frontend Engineer, New Grad", "San Francisco, CA", "$140,000 - $165,000", 10), stage: "applied", since: at(-8, 10), events: [{ at: at(-8, 10), title: "Applied", source: "you", key: true }] },
  { job: job("t-plaid", "Plaid", "Software Engineer, Early Career", "San Francisco, CA", "$135,000 - $160,000", 14), stage: "applied", since: at(-12, 10), events: [{ at: at(-12, 10), title: "Applied", source: "you", key: true }] },
  { job: job("t-cloudflare", "Cloudflare", "Security Engineer, Early Career", "Austin, TX", null, 30), stage: "closed", outcome: "Not selected", since: at(-3, 13), events: [{ at: at(-3, 13), title: "Not selected", source: "email" }] },
  { job: job("t-databricks", "Databricks", "Data Engineer, New Grad", "Mountain View, CA", null, 60), stage: "closed", outcome: "No reply", since: at(-9, 13), events: [] },
  { job: job("t-janestreet", "Jane Street", "Software Engineer Intern", "New York, NY", null, 50), stage: "closed", outcome: "Withdrew", since: at(-15, 13), events: [] },
];

/** Season totals behind the sample rows. */
const totals = { applied: 212, replied: 31, assessment: 13, interviews: 6, offers: 2 };
const stageCounts: Record<Stage, number> = { saved: 14, applied: 180, assessment: 2, interviewing: 3, offer: 1, closed: 40 };
const byId = (id: string) => items.find((item) => item.job.id === id)!;

/* ------------------------------------------------------------ Time words */

const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short" });
const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const clock = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const longDay = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "short", day: "numeric" });

const startOfDay = (time: number) => new Date(new Date(time).setHours(0, 0, 0, 0)).getTime();
const daysAway = (iso: string) => Math.round((startOfDay(Date.parse(iso)) - startOfDay(Date.now())) / DAY);

/** "Today", "Tomorrow", "Fri", "Oct 20". */
function dayWord(iso: string) {
  const days = daysAway(iso);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days > 1 && days < 7) return weekday.format(new Date(iso));
  return monthDay.format(new Date(iso));
}

const whenOf = (step: Step) => (step.time ? `${dayWord(step.at)} ${clock.format(new Date(step.at))}` : dayWord(step.at));
const soon = (step: Step) => daysAway(step.at) <= 1;
const ageOf = (iso: string) => timeAgo(iso).replace(/ ago$/, "");

/* -------------------------------------------------------------- Frames */

function Phone({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("relative h-180 overflow-hidden rounded-sheet border border-line bg-bg", className)}>
      <div data-scroll className="no-scrollbar flex h-full flex-col overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

function Option({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <article className="flex min-w-0 flex-col gap-3 lg:row-span-2 lg:grid lg:grid-rows-subgrid lg:gap-y-3">
      <header className="flex flex-col gap-1">
        <h4 className="text-lead">{title}</h4>
        <p className="text-meta text-ink-3">{note}</p>
      </header>
      <div className="min-w-0">{children}</div>
    </article>
  );
}

const wide = "relative left-1/2 w-[min(calc(100vw-2rem),73.75rem)] -translate-x-1/2";

/* ----------------------------------------------------------------- Rows */

/** A tracked job: the title, then the company, its stage, and what's next.
 * The right edge is when: the next date, or how long it has been. */
function TrackRow({ item, selected, onSelect }: { item: Item; selected?: boolean; onSelect?: () => void }) {
  const { job, next } = item;
  const urgent = next ? soon(next) : false;
  return (
    <div data-selected={selected || undefined} className="ps-row group relative flex items-center gap-3 px-4 py-2.5">
      <CompanyMark name={job.company_name} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <a
            href="#track"
            onClick={(event) => {
              event.preventDefault();
              onSelect?.();
            }}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "ps-row-link min-w-0 truncate text-ui leading-5 after:absolute after:inset-0",
              item.stage === "closed" ? "text-ink-3" : "font-medium text-ink",
            )}
          >
            {job.title}
          </a>
          <span className={cn("ml-auto shrink-0 text-meta tabular-nums", urgent ? "font-medium text-accent-text" : "text-ink-3")}>
            {next ? whenOf(next) : ageOf(item.since)}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-meta">
          <span className="max-w-1/2 shrink-0 truncate font-medium text-ink-2">{job.company_name}</span>
          <Badge tone={stageTone[item.stage]} className="h-5 shrink-0 px-1.5 text-caption">
            {item.stage === "closed" ? item.outcome : stageLabel[item.stage]}
          </Badge>
          {next ? <span className="min-w-0 truncate text-ink-3">{next.label}</span> : null}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- The season */

function Funnel() {
  const steps = [
    { label: "Applied", value: totals.applied },
    { label: "Replied", value: totals.replied },
    { label: "Assessment", value: totals.assessment },
    { label: "Interview", value: totals.interviews },
    { label: "Offer", value: totals.offers },
  ];
  return (
    <div className="flex flex-col gap-3">
      {steps.map((step) => {
        const share = step.value / totals.applied;
        return (
          <div key={step.label} className="group flex items-center gap-3" title={`${step.label}: ${step.value} (${Math.round(share * 100)}% of applied)`}>
            <span className="w-22 shrink-0 text-ui text-ink-2">{step.label}</span>
            <span className="flex h-4 min-w-0 flex-1 items-center">
              <span className="h-4 min-w-0.5 rounded-r-mark bg-accent transition-opacity group-hover:opacity-80" style={{ width: `${share * 100}%` }} />
            </span>
            <span className="w-9 shrink-0 text-right text-ui tabular-nums text-ink">{step.value}</span>
            <span className="w-9 shrink-0 text-right text-meta tabular-nums text-ink-3">{Math.round(share * 100)}%</span>
          </div>
        );
      })}
    </div>
  );
}

/* A flow chart of the season. Each column is a step; bands carry
   applications forward or into a dead end. Pink moves forward, gray stops.
   One scale throughout, so the tiny offer band is honest. */

interface FlowNode {
  id: string;
  label: string;
  value: number;
  column: number;
  end?: boolean;
}

const flowNodes: FlowNode[] = [
  { id: "applied", label: "Applied", value: 212, column: 0 },
  { id: "replied", label: "Replied", value: 31, column: 1 },
  { id: "quiet", label: "No reply yet", value: 181, column: 1, end: true },
  { id: "assessment", label: "Assessment", value: 13, column: 2 },
  { id: "no1", label: "Not selected", value: 18, column: 2, end: true },
  { id: "interview", label: "Interview", value: 6, column: 3 },
  { id: "no2", label: "Not selected", value: 7, column: 3, end: true },
  { id: "offer", label: "Offer", value: 2, column: 4 },
  { id: "active", label: "Interviewing", value: 2, column: 4 },
  { id: "no3", label: "Not selected", value: 2, column: 4, end: true },
];

const flowLinks: [string, string, number][] = [
  ["applied", "replied", 31],
  ["applied", "quiet", 181],
  ["replied", "assessment", 13],
  ["replied", "no1", 18],
  ["assessment", "interview", 6],
  ["assessment", "no2", 7],
  ["interview", "offer", 2],
  ["interview", "active", 2],
  ["interview", "no3", 2],
];

function Flow() {
  const scale = 1.05;
  const gap = 38;
  const top = 34;
  const nodeWidth = 6;
  const columnX = [0, 115, 230, 345, 460];
  const place = new Map<string, { x: number; y: number; h: number; node: FlowNode }>();
  for (let column = 0; column < columnX.length; column++) {
    let y = top;
    for (const node of flowNodes.filter((candidate) => candidate.column === column)) {
      const h = Math.max(2, node.value * scale);
      place.set(node.id, { x: columnX[column]!, y, h, node });
      y += h + gap;
    }
  }
  const outUsed = new Map<string, number>();
  const inUsed = new Map<string, number>();
  const bands = flowLinks.map(([from, to, value]) => {
    const a = place.get(from)!;
    const b = place.get(to)!;
    const h = Math.max(2, value * scale);
    const y0 = a.y + (outUsed.get(from) ?? 0);
    const y1 = b.y + (inUsed.get(to) ?? 0);
    outUsed.set(from, (outUsed.get(from) ?? 0) + h);
    inUsed.set(to, (inUsed.get(to) ?? 0) + h);
    const x0 = a.x + nodeWidth;
    const x1 = b.x;
    const mid = (x0 + x1) / 2;
    const d = `M${x0},${y0} C${mid},${y0} ${mid},${y1} ${x1},${y1} L${x1},${y1 + h} C${mid},${y1 + h} ${mid},${y0 + h} ${x0},${y0 + h} Z`;
    return { d, end: b.node.end, title: `${a.node.label} → ${b.node.label}: ${value}`, key: `${from}-${to}` };
  });
  return (
    <div className="no-scrollbar overflow-x-auto">
      <svg
        viewBox="0 0 545 320"
        className="block w-full min-w-120 max-w-136"
        role="img"
        aria-label="Applications by step: 212 applied, 31 replied, 13 assessments, 6 interviews, 2 offers"
      >
        {bands.map((band) => (
          <path key={band.key} d={band.d} className={cn("transition-opacity hover:opacity-70", band.end ? "fill-ink-3/15" : "fill-accent/30")}>
            <title>{band.title}</title>
          </path>
        ))}
        {[...place.values()].map(({ x, y, h, node }) => (
          <g key={node.id}>
            <rect x={x} y={y} width={nodeWidth} height={h} rx={1.5} className={node.end ? "fill-ink-3" : "fill-accent"}>
              <title>{`${node.label}: ${node.value}`}</title>
            </rect>
            {/* Two short lines, so columns can sit close enough to fit a sheet. */}
            <text x={x} y={y - 20} className={cn("text-caption", node.end ? "fill-ink-3" : "fill-ink-2")}>
              {node.label}
            </text>
            <text x={x} y={y - 6} className={cn("text-caption font-medium tabular-nums", node.end ? "fill-ink-3" : "fill-ink")}>
              {node.value}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/** The season: a funnel by default, the flow when you want the whole story. */
function Season() {
  const [view, setView] = useState("funnel");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Segmented value={[view]} onValueChange={(next) => next[0] && setView(next[0])} aria-label="Season view">
          <Segment value="funnel">Funnel</Segment>
          <Segment value="flow">Flow</Segment>
        </Segmented>
        {view === "flow" ? (
          <Button size="sm" className="ml-auto">
            <ShareIcon size={14} />
            Share
          </Button>
        ) : null}
      </div>
      {view === "funnel" ? <Funnel /> : <Flow />}
      <p className="text-meta text-ink-3">
        {view === "funnel" ? "Each step as a share of everything you applied to." : "Hover a band for its count. Shared as an image, without company names."}
      </p>
    </div>
  );
}

function SeasonCard() {
  return (
    <div className="ps-card flex flex-col gap-4 rounded-sheet p-5">
      <div className="flex flex-col gap-0.5">
        <span className="text-lead font-medium text-ink">Your search so far</span>
        <span className="text-meta text-ink-3">Aug 1 to today · {totals.applied} applications</span>
      </div>
      <Season />
    </div>
  );
}

/** The season in one line. Tapping it opens the funnel. */
function SeasonLine({ onOpen }: { onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex cursor-pointer items-center gap-1 self-start rounded-mark text-meta tabular-nums text-ink-2 focus-ring"
    >
      {totals.applied} applied · {totals.replied} replied · {totals.interviews} interviews · {totals.offers} offers
      <ChevronRightIcon size={13} className="text-ink-3" />
    </button>
  );
}

function SeasonSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Backdrop />
        <Drawer.Viewport>
          <Drawer.Popup>
            <DrawerHandle />
            <Drawer.Content className="gap-4 pb-6">
              <div className="flex flex-col gap-0.5">
                <Drawer.Title>Your search so far</Drawer.Title>
                <Drawer.Description>Aug 1 to today · {totals.applied} applications</Drawer.Description>
              </div>
              <Season />
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ----------------------------------------------------------------- List */

/** With email connected: what changed since you last looked, each undoable. */
function EmailUpdates() {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  const updates = [
    { company: "Ramp", text: "Sent an assessment", moved: "Moved to Assessment" },
    { company: "Cloudflare", text: "Isn't moving forward", moved: "Moved to Closed" },
    { company: "Coinbase", text: "Thanks for applying", moved: "Added to Track" },
  ];
  return (
    <div className="ps-card mx-4 mb-3 rounded-surface">
      <div className="flex items-baseline justify-between px-3.5 pt-3">
        <span className="text-ui font-medium text-ink">Since yesterday</span>
        <span className="text-meta text-ink-3">From your email</span>
      </div>
      <ul className="mt-1">
        {updates.map((update) => (
          <li key={update.company} className="flex items-center gap-3 px-3.5 py-2">
            <CompanyMark name={update.company} size="sm" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-ui text-ink">
                <span className="font-medium">{update.company}</span> · {update.text}
              </span>
              <span className="text-meta text-ink-3">{update.moved}</span>
            </div>
            <Button variant="ghost" size="sm">
              Undo
            </Button>
          </li>
        ))}
      </ul>
      <div className="border-t border-line px-1.5 py-1.5">
        <Button variant="ghost" size="sm" className="w-full" onClick={() => setOpen(false)}>
          Got it
        </Button>
      </div>
    </div>
  );
}

const chipStages: Stage[] = ["saved", "applied", "assessment", "interviewing", "offer", "closed"];

function StageChips({ stage, onStage }: { stage: Stage | "all"; onStage: (stage: Stage | "all") => void }) {
  return (
    <div className="no-scrollbar -my-1 flex gap-1.5 overflow-x-auto py-1.5">
      <Chip size="sm" pressed={stage === "all"} onPressedChange={() => onStage("all")}>
        All
      </Chip>
      {chipStages.map((value) => (
        <Chip key={value} size="sm" pressed={stage === value} onPressedChange={() => onStage(value)}>
          {stageLabel[value]}
          <span className="tabular-nums text-ink-3">{stageCounts[value]}</span>
        </Chip>
      ))}
    </div>
  );
}

/** The list for one stage, or all of them by latest activity. Saved jobs
 * keep the Jobs row, since place and pay still decide whether you apply. */
function StageList({
  stage,
  email,
  selected,
  onSelect,
}: {
  stage: Stage | "all";
  email: boolean;
  selected?: string;
  onSelect?: (id: string) => void;
}) {
  const shown = stage === "all" ? items : items.filter((item) => item.stage === stage);
  const sorted = [...shown].sort((a, b) => (b.events[0]?.at ?? b.since).localeCompare(a.events[0]?.at ?? a.since));
  return (
    <>
      {email && stage === "all" ? <EmailUpdates /> : null}
      <ul className="border-y border-line">
        {sorted.map((item) => (
          <JobListItem key={item.job.id}>
            {stage === "saved" ? (
              <JobRow job={item.job} href="#track" selected={selected === item.job.id} onOpen={(event) => {
                event.preventDefault();
                onSelect?.(item.job.id);
              }} />
            ) : (
              <TrackRow item={item} selected={selected === item.job.id} onSelect={() => onSelect?.(item.job.id)} />
            )}
          </JobListItem>
        ))}
      </ul>
    </>
  );
}

function TrackList({ email }: { email: boolean }) {
  const [stage, setStage] = useState<Stage | "all">("all");
  const [season, setSeason] = useState(false);
  return (
    <>
      <div className="sticky top-0 z-20 flex flex-col gap-2 border-b border-line bg-bg/90 px-4 pb-2 pt-3 backdrop-blur-bar">
        <SearchInput size="lg" placeholder="Search your applications" aria-label="Search Track" />
        <StageChips stage={stage} onStage={setStage} />
      </div>
      <div className="px-4 pb-2 pt-3">
        <SeasonLine onOpen={() => setSeason(true)} />
      </div>
      <StageList stage={stage} email={email} />
      <SeasonSheet open={season} onOpenChange={setSeason} />
    </>
  );
}

/* ------------------------------------------------------------- Job page */

function JobHeader({ item }: { item: Item }) {
  const { job } = item;
  const place = formatRowLocation(job.location);
  const pay = formatRowSalary(job.salary);
  return (
    <header className="flex flex-col gap-2">
      <div className="flex h-6 min-w-0 items-center gap-1.5 text-ui">
        <CompanyMark name={job.company_name} size="sm" />
        <span className="truncate font-medium text-ink">{job.company_name}</span>
        <span className="text-ink-3" aria-hidden="true">
          ·
        </span>
        <span className="shrink-0 text-ink-3">Posted {ageOf(job.posted_at!)} ago</span>
      </div>
      <h2 className="text-balance text-heading">{job.title}</h2>
      <ul className="ps-facts text-ui text-ink-2">
        {place ? <li className="whitespace-normal">{place}</li> : null}
        {pay ? <li>{pay}</li> : null}
      </ul>
    </header>
  );
}

const sourceWord = { email: "From email", you: "You", pinkslip: "Pinkslip" } as const;

/** The upcoming step, then what happened, newest first. */
function Timeline({ item, email }: { item: Item; email: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {item.next ? (
        <div className="ps-card flex items-center gap-3 rounded-surface px-3.5 py-3">
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-meta font-medium text-accent-text">Next</span>
            <span className="text-ui font-medium text-ink">{item.next.label}</span>
            <span className="text-meta text-ink-2">
              {longDay.format(new Date(item.next.at))}
              {item.next.time ? ` · ${clock.format(new Date(item.next.at))}` : ""}
            </span>
          </div>
        </div>
      ) : null}
      <ol className="flex flex-col">
        {item.events.map((event, index) => (
          <li key={event.at} className="relative flex gap-3 pb-4 last:pb-0">
            {index < item.events.length - 1 ? (
              <span className="absolute left-[3.5px] top-3 h-full w-px bg-line-2" aria-hidden="true" />
            ) : null}
            <span className={cn("relative mt-1.5 size-2 shrink-0 rounded-pill", event.key ? "bg-accent" : "bg-line-2")} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-ui text-ink">{event.title}</span>
              {event.detail ? <span className="text-meta text-ink-2">{event.detail}</span> : null}
              <span className="text-meta text-ink-3">
                {monthDay.format(new Date(event.at))}
                {email && event.source ? ` · ${sourceWord[event.source]}` : ""}
              </span>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        <Button size="sm">Add a date</Button>
        <Button size="sm">Add a note</Button>
      </div>
    </div>
  );
}

/** Outreach: the people you've written to about this job. */
function People({ item }: { item: Item }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-ui font-medium text-ink">People at {item.job.company_name}</h3>
      {item.people?.length ? (
        <ul className="ps-card rounded-surface">
          {item.people.map((person) => (
            <li key={person.name} className="flex items-center gap-3 border-t border-line px-3.5 py-3 first:border-t-0">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-pill bg-control text-meta font-medium text-ink-2">
                {person.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-ui font-medium text-ink">{person.name}</span>
                <span className="truncate text-meta text-ink-3">
                  {person.role} · {person.status}
                </span>
              </div>
              <Button size="sm">{person.action}</Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-meta text-ink-3">A recruiter or the hiring manager can move an application along.</p>
      )}
      <Button variant="ghost" size="sm" className="self-start text-ink-2">
        Find people at {item.job.company_name}
      </Button>
    </div>
  );
}

function JobBar({ item }: { item: Item }) {
  const action = stageAction[item.stage];
  return (
    <div className="sticky bottom-0 z-20 mt-auto shrink-0 border-t border-line bg-bg/90 backdrop-blur-bar">
      <div className="flex items-center gap-2 px-4 py-3">
        <Button size="lg" className="gap-1.5 px-4">
          {item.stage === "saved" ? (
            <BookmarkIcon size={18} fill="currentColor" className="text-accent-text" />
          ) : (
            <CheckIcon size={16} strokeWidth={2.2} className="text-good" />
          )}
          {stageLabel[item.stage]}
          <ChevronDownIcon size={15} className="text-ink-3" />
        </Button>
        {item.stage === "saved" ? (
          <Button variant="primary" size="lg" className="flex-1">
            Auto apply
          </Button>
        ) : action ? (
          <Button variant="primary" size="lg" className="flex-1">
            {action}
          </Button>
        ) : (
          <Button size="lg" className="flex-1">
            Open posting
          </Button>
        )}
      </div>
    </div>
  );
}

const posting = (
  <div className="ps-prose">
    <h3>About the role</h3>
    <p>
      You'll join one of our product teams as a full-time engineer, working across the stack on features customers
      use every day.
    </p>
    <h3>What you'll do</h3>
    <ul>
      <li>Build and ship features end to end, from the database to the interface.</li>
      <li>Own a piece of the product and talk directly with the customers who use it.</li>
    </ul>
  </div>
);

/** A tracked job's page. The posting and your application are tabs; once
 * you've applied, the page opens on your application. */
function TrackedJob({ item, email, inPane = false }: { item: Item; email: boolean; inPane?: boolean }) {
  const [tab, setTab] = useState(item.stage === "saved" ? "posting" : "application");
  return (
    <>
      {inPane ? null : (
        <div className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-1 bg-bg/90 px-2 backdrop-blur-bar">
          <Button variant="ghost" size="sm" className="shrink-0 gap-0.5 pl-1 text-ui">
            <ChevronLeftIcon size={18} />
            Track
          </Button>
          <span className="flex-1" />
          <Button variant="ghost" size="icon" aria-label="More actions">
            <MoreIcon size={18} />
          </Button>
        </div>
      )}
      <div className={cn("flex flex-col gap-5 pb-8", inPane ? "mx-auto w-full max-w-170 px-6 pt-5" : "px-4 pt-1")}>
        <JobHeader item={item} />
        <Segmented value={[tab]} onValueChange={(next) => next[0] && setTab(next[0])} aria-label="Show" className="w-full">
          <Segment value="posting">Posting</Segment>
          <Segment value="application">Your application</Segment>
        </Segmented>
        {tab === "application" ? (
          <>
            <Timeline item={item} email={email} />
            <People item={item} />
          </>
        ) : (
          posting
        )}
      </div>
      <JobBar item={item} />
    </>
  );
}

/* -------------------------------------------------------------- Desktop */

function ListAndJob({ email }: { email: boolean }) {
  const [stage, setStage] = useState<Stage | "all">("all");
  const [selected, setSelected] = useState("t-stripe");
  const [season, setSeason] = useState(false);
  const item = byId(selected);
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-line px-5 py-3">
        <SearchInput placeholder="Search your applications" aria-label="Search Track" className="w-72 shrink-0" />
        <div className="min-w-0 flex-1">
          <StageChips stage={stage} onStage={setStage} />
        </div>
        <SeasonLine onOpen={() => setSeason(true)} />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[22.5rem_1fr]">
        <div className="no-scrollbar min-h-0 overflow-y-auto border-r border-line pt-3">
          <StageList stage={stage} email={email} selected={selected} onSelect={setSelected} />
        </div>
        <div data-scroll className="no-scrollbar relative flex min-h-0 flex-col overflow-y-auto">
          <TrackedJob key={selected} item={item} email={email} inPane />
        </div>
      </div>
      <SeasonSheet open={season} onOpenChange={setSeason} />
    </div>
  );
}

/* ------------------------------------------------------------------ Empty */

function Empty() {
  return (
    <Phone className="h-130">
      <div className="sticky top-0 z-20 flex flex-col gap-2 border-b border-line bg-bg/90 px-4 pb-3 pt-3 backdrop-blur-bar">
        <SearchInput size="lg" placeholder="Search your applications" aria-label="Search Track" />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
        <div className="flex flex-col gap-1.5">
          <span className="text-lead font-medium text-ink">Nothing in Track yet</span>
          <span className="text-ui text-ink-2">Save a job or apply to one, and it shows up here with whatever's next.</span>
        </div>
        <Button variant="primary">Browse jobs</Button>
      </div>
      <div className="mx-4 mb-4 flex flex-col gap-2 rounded-surface border border-dashed border-line-2 p-3.5">
        <span className="text-ui font-medium text-ink">Applied somewhere else?</span>
        <span className="text-meta text-ink-3">Paste a link to add it. Or connect your email and Track fills itself in.</span>
        <div className="flex gap-2">
          <Button size="sm">Add by link</Button>
          <Button size="sm">Connect email</Button>
        </div>
      </div>
    </Phone>
  );
}

/* ---------------------------------------------------------------- Group */

export function TrackGroup() {
  const [email, setEmail] = useState(false);
  const [jobId, setJobId] = useState("t-stripe");
  return (
    <Group id="track" title="Track">
      <div className="flex flex-col gap-4 pt-3">
        <p className="max-w-prose text-body text-ink-2">
          The picks: stage chips over one list, rows that name the stage, the season as a funnel that switches to the
          flow, and a job page with your application as a tab. Turn email on to see where its updates show up.
        </p>
        <div className="flex flex-col gap-2">
          <span className="text-ui font-medium text-ink">Email</span>
          <Segmented value={[email ? "on" : "off"]} onValueChange={(next) => next[0] && setEmail(next[0] === "on")} aria-label="Email" className="self-start">
            <Segment value="off">Not connected</Segment>
            <Segment value="on">Connected</Segment>
          </Segmented>
        </div>
      </div>

      <div className={cn("mt-10 grid gap-x-6 gap-y-10 lg:grid-cols-3", wide)}>
        <Option title="The list" note="Small stage chips under search. All sorts by latest activity. Tap the season line for the funnel.">
          <div className="max-lg:-mx-4">
            <Phone>
              <TrackList email={email} />
            </Phone>
          </div>
        </Option>
        <Option title="A tracked job" note="Your application is a tab. It opens first once you've applied; a saved job opens on the posting.">
          <div className="flex flex-col gap-3">
            <Segmented value={[jobId]} onValueChange={(next) => next[0] && setJobId(next[0])} aria-label="Job" className="self-start">
              <Segment value="t-stripe">Stripe, interviewing</Segment>
              <Segment value="t-linear">Linear, saved</Segment>
            </Segmented>
            <div className="max-lg:-mx-4">
              <Phone className="h-168">
                <TrackedJob key={jobId} item={byId(jobId)} email={email} />
              </Phone>
            </div>
          </div>
        </Option>
        <Option title="The season" note="A funnel by default; switch to the flow for where every application went, and share it.">
          <div className="flex flex-col gap-10">
            <SeasonCard />
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <h4 className="text-lead">Empty</h4>
                <p className="text-meta text-ink-3">The first visit, before anything is tracked.</p>
              </div>
              <Empty />
            </div>
          </div>
        </Option>
      </div>

      <section aria-labelledby="track-desktop" className={cn("mt-14 flex flex-col gap-4", wide)}>
        <header className="flex max-w-prose flex-col gap-1">
          <h3 id="track-desktop" className="text-title">
            On a wide screen
          </h3>
          <p className="text-meta text-ink-3">The same list with the job beside it. Click a row; try the chips.</p>
        </header>
        <div className="no-scrollbar overflow-x-auto rounded-sheet border border-line bg-bg">
          <div className="h-150 min-w-240">
            <ListAndJob email={email} />
          </div>
        </div>
      </section>
    </Group>
  );
}
