import type { Job } from "@pinkslip/core/api";
import { formatRowLocation, jobLocationParts, jobPayBands, type PayBand } from "@pinkslip/core/job-format";
import { jobTimingLabel } from "@pinkslip/core/job-timing";
import { Button } from "@pinkslip/ui/button";
import {
  AlertIcon,
  BookmarkIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  MoreIcon,
  ShareIcon,
} from "@pinkslip/ui/icons";
import { cn } from "@pinkslip/ui/lib/cn";
import { Menu } from "@pinkslip/ui/menu";
import { Drawer, DrawerHandle } from "@pinkslip/ui/overlay";
import { useToastManager } from "@pinkslip/ui/toast";
import { Segment, Segmented, Toggle } from "@pinkslip/ui/toggle";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { CompanyMark } from "../../components/company-mark";
import { sampleJobs } from "../data";
import { Group } from "../specimen";

/* Job page, round 5. The company on a slim row with when it was posted,
   the exact title full width below, fit as a quiet line of what the header
   doesn't already say, and a bar of Save (which becomes the Track status)
   and Apply, or Auto apply for subscribers. Tailor lives in the auto-apply
   sheet. Once a direction is picked this
   becomes the real page and this file goes away. */

/* ------------------------------------------------------------ Mock data */

/** The cities in the demo user's search profile. */
const myCities = ["New York", "San Francisco"];
const isMine = (place: string) => myCities.some((city) => place.toLowerCase().includes(city.toLowerCase()));

/** Fit, minus anything the title or facts already say. */
interface Flag {
  kind: "good" | "warn";
  label: string;
}

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const demoJobs: { job: Job; flags: Flag[] }[] = [
  {
    job: sampleJobs[0]!,
    flags: [
      { kind: "warn", label: "In office 3 days" },
      { kind: "warn", label: "No visa sponsorship" },
    ],
  },
  {
    job: {
      ...sampleJobs[0]!,
      id: "stripe-detail",
      company_name: "Stripe",
      title: "Software Engineer, New Grad",
      location: "Seattle, WA | San Francisco, CA | New York, NY | Chicago, IL | Remote (US)",
      salary:
        "San Francisco or New York: $165,000 - $200,000 | Seattle: $155,000 - $190,000 | Remote: $140,000 - $170,000",
      posted_at: ago(52),
      first_seen_at: ago(50),
      source_type: "greenhouse",
      saved: false,
    },
    flags: [{ kind: "good", label: "Sponsors visas" }],
  },
  {
    job: sampleJobs[2]!,
    flags: [{ kind: "warn", label: "Asks for 1+ years" }],
  },
];

const sections: { id: string; title: string; body: ReactNode }[] = [
  {
    id: "role",
    title: "About the role",
    body: (
      <p>
        You'll join one of our product teams as a full-time engineer, working across the stack on features customers
        use every day. New grads pair with a mentor for their first quarter and ship to production in their first two
        weeks.
      </p>
    ),
  },
  {
    id: "do",
    title: "What you'll do",
    body: (
      <ul>
        <li>Build and ship features end to end, from the database to the interface.</li>
        <li>Own a piece of the product and talk directly with the customers who use it.</li>
        <li>Review code, write design docs, and help decide what the team builds next.</li>
      </ul>
    ),
  },
  {
    id: "need",
    title: "What we're looking for",
    body: (
      <ul>
        <li>A degree in computer science or a related field, finishing by June 2027.</li>
        <li>At least one internship or substantial project in a typed language.</li>
        <li>
          <strong>Nice to have:</strong> experience with React, Python, or payments.
        </li>
      </ul>
    ),
  },
];

/* --------------------------------------------------------- Places and pay */

const placesOf = (job: Job) => {
  const places = jobLocationParts(job.location);
  return [...places.filter(isMine), ...places.filter((place) => !isMine(place))];
};

const cityOf = (place: string) => place.split(",")[0]!.trim().toLowerCase();

/** The pay band a posting gives for a place, matched by city name. */
const bandFor = (place: string, bands: PayBand[]) =>
  bands.find((band) => band.region?.toLowerCase().includes(cityOf(place))) ?? null;

/** The full spread across bands: "$140–200K". */
function payRange(bands: PayBand[]) {
  if (bands.length < 2) return bands[0]?.amount ?? null;
  const ranges = bands.map((band) => band.amount.match(/^\$(\d+)–(\d+)K$/));
  if (ranges.some((range) => !range)) return bands[0]!.amount;
  return `$${Math.min(...ranges.map((range) => Number(range![1])))}–${Math.max(...ranges.map((range) => Number(range![2])))}K`;
}

/** Too many places for the line, or pay that depends on place. */
const needsSheet = (job: Job) => jobPayBands(job.salary).length > 1 || jobLocationParts(job.location).length > 3;

/** "New York or Remote", "Austin, Denver, or Remote". */
function joinPlaces(places: string[]) {
  const short = places.map((place) => formatRowLocation(place) ?? place);
  if (short.length < 3) return short.join(" or ");
  return `${short.slice(0, -1).join(", ")}, or ${short.at(-1)}`;
}

/* ------------------------------------------------------------ Page state */

const stages = ["Saved", "Applied", "Assessment", "Interviewing", "Offer"] as const;
const endings = ["Not selected", "Withdrew"] as const;
type Status = (typeof stages)[number] | (typeof endings)[number];
type Start = "new" | "saved" | "applied" | "closed";

function useJob(job: Job, start: Start, auto: boolean) {
  const toasts = useToastManager();
  const [status, setStatus] = useState<Status | null>(
    start === "saved" ? "Saved" : start === "applied" ? "Applied" : null,
  );
  const [via, setVia] = useState<"auto" | "self">("self");
  const [asking, setAsking] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [tailored, setTailored] = useState(false);
  const mark = <CompanyMark name={job.company_name} size="sm" />;
  const applySelf = () => {
    setReviewing(false);
    setAsking(true);
  };
  return {
    job,
    auto,
    closed: start === "closed",
    status,
    applied: status !== null && status !== "Saved",
    via,
    asking,
    reviewing,
    setReviewing,
    placesOpen,
    setPlacesOpen,
    tailored,
    setStatus,
    apply: () => (auto ? setReviewing(true) : applySelf()),
    applySelf,
    notYet: () => setAsking(false),
    confirm: (how: "auto" | "self") => {
      setAsking(false);
      setReviewing(false);
      setVia(how);
      setStatus("Applied");
      toasts.add({
        title: how === "auto" ? "Application sent" : "Moved to Applied",
        description: `${job.title} at ${job.company_name}`,
        data: { leading: mark },
      });
    },
    tailor: () => {
      setTailored(true);
      toasts.add({ title: "Resume tailored", description: `Rewritten around what ${job.company_name} asks for.`, data: { leading: mark } });
    },
  };
}

type Page = ReturnType<typeof useJob>;

/** True once the element has scrolled up under the top bar. */
function useScrolledPast<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [past, setPast] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const root = node.closest<HTMLElement>("[data-scroll]");
    const observer = new IntersectionObserver(
      ([entry]) => setPast(!entry!.isIntersecting && entry!.boundingClientRect.top < (entry!.rootBounds?.top ?? 0) + 48),
      { root, rootMargin: "-48px 0px 0px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, past] as const;
}

/* ------------------------------------------------------------- Bottom bar */

/** Save, then the job's stage in Track. Saving and applying are steps of
 * one status, so a job is never both. */
function StatusControl({ page }: { page: Page }) {
  if (!page.status) {
    return (
      <Toggle size="lg" raised pressed={false} onPressedChange={() => page.setStatus("Saved")}>
        <BookmarkIcon size={18} />
        Save
      </Toggle>
    );
  }
  return (
    <Menu.Root>
      <Menu.Trigger render={<Button size="lg" className="shrink-0 gap-1.5 px-4" />}>
        {page.status === "Saved" ? (
          <BookmarkIcon size={18} fill="currentColor" className="text-accent-text" />
        ) : page.applied && !(endings as readonly string[]).includes(page.status) ? (
          <CheckIcon size={16} strokeWidth={2.2} className="text-good" />
        ) : null}
        {page.status}
        <ChevronDownIcon size={15} className="text-ink-3" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="top" align="start" sideOffset={6}>
          <Menu.Popup>
            <Menu.Group>
              <Menu.GroupLabel>In Track</Menu.GroupLabel>
              <Menu.RadioGroup value={page.status} onValueChange={(value) => page.setStatus(value as Status)}>
                {[...stages, ...endings].map((stage) => (
                  <Fragment key={stage}>
                    {stage === endings[0] ? <Menu.Separator /> : null}
                    <Menu.RadioItem value={stage}>
                      <Menu.RadioItemIndicator>
                        <CheckIcon size={14} />
                      </Menu.RadioItemIndicator>
                      <span className="col-start-2">{stage}</span>
                    </Menu.RadioItem>
                  </Fragment>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
            <Menu.Separator />
            <Menu.Item onClick={() => page.setStatus(null)}>Remove from Track</Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** Auto apply for subscribers, Apply for everyone else. Applying on the
 * company's site instead lives in the auto-apply sheet and the ⋯ menu. */
function ApplyButton({ page }: { page: Page }) {
  return (
    <Button variant="primary" size="lg" className="flex-1" onClick={page.apply}>
      {page.auto ? "Auto apply" : "Apply"}
    </Button>
  );
}

function ActionBar({ page }: { page: Page }) {
  return (
    <div className="sticky bottom-0 z-20 mt-auto shrink-0 border-t border-line bg-bg/90 backdrop-blur-bar">
      <div className="flex items-center gap-2 px-4 py-3">
        {page.asking ? (
          <>
            <span className="min-w-0 flex-1 text-ui font-medium text-ink">Did you apply?</span>
            <Button size="lg" className="px-4" onClick={page.notYet}>
              Not yet
            </Button>
            <Button variant="primary" size="lg" className="px-4" onClick={() => page.confirm("self")}>
              Yes, applied
            </Button>
          </>
        ) : (
          <>
            <StatusControl page={page} />
            {page.closed ? (
              <span className="min-w-0 flex-1 px-1 text-meta text-ink-3">This listing closed 2 hours ago.</span>
            ) : page.applied ? (
              <Button size="lg" className="flex-1">
                {page.via === "auto" ? "View application" : "Open posting"}
              </Button>
            ) : (
              <ApplyButton page={page} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- Sheets */

function ReviewSheet({ page }: { page: Page }) {
  const { job } = page;
  const rows: { label: string; value: string; warn?: boolean; action?: ReactNode }[] = [
    {
      label: "Resume",
      value: page.tailored ? `Tailored for ${job.company_name}` : "Your main resume",
      action: page.tailored ? null : (
        <Button size="sm" onClick={page.tailor}>
          Tailor
        </Button>
      ),
    },
    { label: "Profile", value: "Name, email, phone, links" },
    { label: "Questions", value: "4 of 5 answered", warn: true, action: <Button size="sm">Answer</Button> },
  ];
  return (
    <Drawer.Root open={page.reviewing} onOpenChange={page.setReviewing}>
      <Drawer.Portal>
        <Drawer.Backdrop />
        <Drawer.Viewport>
          <Drawer.Popup>
            <DrawerHandle />
            <Drawer.Content className="pb-6">
              <Drawer.Title>Apply to {job.company_name}</Drawer.Title>
              <Drawer.Description>
                We fill in {job.company_name}'s application with these. Nothing is sent until you tap Send.
              </Drawer.Description>
              <ul className="ps-card mt-3 rounded-surface">
                {rows.map((row) => (
                  <li key={row.label} className="flex items-center gap-3 border-t border-line px-3.5 py-3 first:border-t-0">
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="text-meta text-ink-3">{row.label}</span>
                      <span className={cn("flex items-center gap-1.5 text-ui", row.warn ? "text-warn" : "text-ink")}>
                        {row.warn ? <AlertIcon size={13} /> : null}
                        {row.value}
                      </span>
                    </div>
                    {row.action}
                  </li>
                ))}
              </ul>
              <Button variant="primary" size="lg" className="mt-4" onClick={() => page.confirm("auto")}>
                Send application
              </Button>
              <Button variant="ghost" className="self-center" onClick={page.applySelf}>
                Apply on their site instead
              </Button>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/** Every place with its pay, yours first. On a wide screen this would be a
 * popover beside the line instead of a sheet. */
function PlacesSheet({ page }: { page: Page }) {
  const { job } = page;
  const places = placesOf(job);
  const bands = jobPayBands(job.salary);
  return (
    <Drawer.Root open={page.placesOpen} onOpenChange={page.setPlacesOpen}>
      <Drawer.Portal>
        <Drawer.Backdrop />
        <Drawer.Viewport>
          <Drawer.Popup>
            <DrawerHandle />
            <Drawer.Content className="pb-6">
              <Drawer.Title>{places.length} places</Drawer.Title>
              <Drawer.Description>
                {bands.length > 1 ? "Pay depends on where you work. Your cities are first." : "Your cities are first."}
              </Drawer.Description>
              <ul className="ps-card mt-3 rounded-surface">
                {places.map((place) => {
                  const band = bandFor(place, bands);
                  return (
                    <li key={place} className="flex items-center gap-2 border-t border-line px-3.5 py-3 text-ui first:border-t-0">
                      <span className={cn("min-w-0 flex-1 truncate", isMine(place) ? "text-ink" : "text-ink-2")}>{place}</span>
                      {isMine(place) ? <CheckIcon size={14} strokeWidth={2.2} className="shrink-0 text-good" aria-label="One of your cities" /> : null}
                      {bands.length ? (
                        <span className={cn("shrink-0 tabular-nums", band ? "text-ink" : "text-ink-3")}>
                          {band ? band.amount : "Not listed"}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ----------------------------------------------------------------- Header */

/** When it was posted, or that it closed. */
const ageOf = (page: Page) => (page.closed ? "Closed 2h ago" : jobTimingLabel(page.job));

/** The company: a small logo and its name. Not a link for now. */
function Company({ page }: { page: Page }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <CompanyMark name={page.job.company_name} size="sm" />
      <span className="truncate text-ui font-medium text-ink">{page.job.company_name}</span>
    </span>
  );
}

/** The company, then when it was posted (or that it closed). */
function CompanyRow({ page }: { page: Page }) {
  return (
    <div className="flex h-6 min-w-0 items-center gap-1.5 text-ui">
      <Company page={page} />
      <span aria-hidden="true" className="text-ink-3">
        ·
      </span>
      <span className={cn("shrink-0", page.closed ? "text-bad" : "text-ink-3")}>{ageOf(page)}</span>
    </div>
  );
}

function TopBar({ page, past }: { page: Page; past: boolean }) {
  return (
    <div
      data-stuck={past || undefined}
      className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-1 border-b border-transparent bg-bg/90 px-2 backdrop-blur-bar transition-colors data-[stuck]:border-line"
    >
      <Button variant="ghost" size="sm" className="shrink-0 gap-0.5 pl-1 text-ui">
        <ChevronLeftIcon size={18} />
        Jobs
      </Button>
      <span
        className={cn("min-w-0 flex-1 truncate px-1 text-ui font-medium text-ink transition-opacity", past ? "opacity-100" : "opacity-0")}
        aria-hidden={!past}
      >
        {page.job.title}
      </span>
      <Button variant="ghost" size="icon" aria-label="Share" className="shrink-0">
        <ShareIcon size={18} />
      </Button>
      <Menu.Root>
        <Menu.Trigger render={<Button variant="ghost" size="icon" aria-label="More actions" className="shrink-0" />}>
          <MoreIcon size={18} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner side="bottom" align="end" sideOffset={4}>
            <Menu.Popup>
              {/* For jobs you applied to somewhere else first. */}
              {page.applied ? null : <Menu.Item onClick={() => page.confirm("self")}>Mark as applied</Menu.Item>}
              <Menu.Item onClick={page.applied ? undefined : page.applySelf}>Open original posting</Menu.Item>
              <Menu.Separator />
              <Menu.Item>Hide this job</Menu.Item>
              <Menu.Item>Hide all {page.job.company_name} jobs</Menu.Item>
              <Menu.Separator />
              <Menu.Item>Report listing</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}

/** Where and what it pays. Simple postings say it on the line; postings with
 * many places, or pay by place, lead with your city and open the rest. */
function Facts({ page }: { page: Page }) {
  const { job } = page;
  const places = placesOf(job);
  const bands = jobPayBands(job.salary);
  if (!needsSheet(job)) {
    return (
      <ul className="ps-facts text-ui text-ink-2">
        {places.length ? <li className="whitespace-normal">{joinPlaces(places)}</li> : null}
        <li className={bands.length ? undefined : "text-ink-3"}>{bands.length ? payRange(bands) : "No pay listed"}</li>
      </ul>
    );
  }
  const lead = places[0]!;
  const leadPay = bands.length ? (bandFor(lead, bands)?.amount ?? payRange(bands)) : null;
  const open = () => page.setPlacesOpen(true);
  const trigger = "cursor-pointer rounded-mark text-ink-2 hover:text-ink focus-ring";
  return (
    <ul className="ps-facts text-ui text-ink-2">
      <li>
        <button type="button" className={trigger} onClick={open}>
          {formatRowLocation(lead) ?? lead} <span className="font-medium text-accent-text">+{places.length - 1} more</span>
        </button>
      </li>
      <li>
        {leadPay ? (
          <button type="button" className={trigger} onClick={open}>
            {leadPay}
          </button>
        ) : (
          <span className="text-ink-3">No pay listed</span>
        )}
      </li>
    </ul>
  );
}

/** Fit that the header doesn't already show: a quiet line, not pills. */
function Flags({ job }: { job: Job }) {
  const flags = demoJobs.find((item) => item.job.id === job.id)?.flags ?? [];
  if (!flags.length) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-ui text-ink-2">
      {flags.map((flag) => (
        <li key={flag.label} className="flex items-center gap-1.5">
          {flag.kind === "good" ? (
            <CheckIcon size={14} strokeWidth={2.2} className="text-good" />
          ) : (
            <AlertIcon size={14} className="text-warn" />
          )}
          {flag.label}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ Page */

/** Titles are shown exactly as posted. Long ones step down a size and
 * wrap evenly, so they read as one block instead of a ragged column. */
const LONG_TITLE = 60;

function JobPage({ page }: { page: Page }) {
  const [titleRef, past] = useScrolledPast<HTMLHeadingElement>();
  const { job } = page;
  return (
    <>
      <TopBar page={page} past={past} />
      <div className="flex flex-col gap-4 px-4 pb-8 pt-1">
        <header className="flex flex-col gap-2">
          <CompanyRow page={page} />
          <h2 ref={titleRef} className={cn("text-balance", job.title.length > LONG_TITLE ? "text-title" : "text-heading")}>
            {job.title}
          </h2>
          <Facts page={page} />
        </header>
        <Flags job={job} />
        <div className="ps-prose border-t border-line pt-5">
          {sections.map((section) => (
            <Fragment key={section.id}>
              <h3>{section.title}</h3>
              {section.body}
            </Fragment>
          ))}
        </div>
      </div>
      <ActionBar page={page} />
    </>
  );
}

function Phone({ job, start, auto }: { job: Job; start: Start; auto: boolean }) {
  const page = useJob(job, start, auto);
  return (
    <div className="relative h-150 overflow-hidden rounded-sheet border border-line bg-bg">
      <div data-scroll className="no-scrollbar flex h-full flex-col overflow-y-auto">
        <JobPage page={page} />
      </div>
      <ReviewSheet page={page} />
      <PlacesSheet page={page} />
    </div>
  );
}

/* ---------------------------------------------------------------- Group */

const wide = "relative left-1/2 w-[min(calc(100vw-2rem),73.75rem)] -translate-x-1/2";

export function JobPageGroup() {
  const [start, setStart] = useState<Start>("new");
  const [subscribed, setSubscribed] = useState(true);
  return (
    <Group id="job-page" title="Job page">
      <div className="flex flex-col gap-4 pt-3">
        <p className="max-w-prose text-body text-ink-2">
          The company sits on a slim row with when it was posted, and the title runs full width below, exactly as
          posted. Fit lists only what the header doesn't already say. Stripe's places and pay open from the line. The
          bar is Save, which becomes the job's status in Track, and Apply, or Auto apply for subscribers. Applying on
          the company's site instead is in the auto-apply sheet and the ⋯ menu, which also marks a job applied.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-4">
          <div className="flex flex-col gap-2">
            <span className="text-ui font-medium text-ink">Start as</span>
            <Segmented value={[start]} onValueChange={(next) => next[0] && setStart(next[0] as Start)} aria-label="Start as">
              <Segment value="new">New</Segment>
              <Segment value="saved">Saved</Segment>
              <Segment value="applied">Applied</Segment>
              <Segment value="closed">Closed</Segment>
            </Segmented>
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-ui font-medium text-ink">Plan</span>
            <Segmented
              value={[subscribed ? "on" : "off"]}
              onValueChange={(next) => next[0] && setSubscribed(next[0] === "on")}
              aria-label="Plan"
            >
              <Segment value="on">Subscribed</Segment>
              <Segment value="off">Not subscribed</Segment>
            </Segmented>
          </div>
        </div>
      </div>
      <div className={cn("mt-8 grid gap-x-6 gap-y-8 lg:grid-cols-3", wide)}>
        {demoJobs.map(({ job }) => (
          <div key={job.id} className="min-w-0 max-lg:-mx-4">
            <Phone key={`${start}-${subscribed}`} job={job} start={start} auto={subscribed} />
          </div>
        ))}
      </div>
    </Group>
  );
}
