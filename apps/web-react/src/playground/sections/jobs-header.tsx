import { ToggleGroup } from "@base-ui/react/toggle-group";
import type { Job } from "@pinkslip/core/api";
import { formatCompactSalaryText } from "@pinkslip/core/job-format";
import { Button } from "@pinkslip/ui/button";
import { SearchInput } from "@pinkslip/ui/field";
import { Popover } from "@pinkslip/ui/floating";
import { ChevronDownIcon } from "@pinkslip/ui/icons";
import { cn } from "@pinkslip/ui/lib/cn";
import { Chip, chipClass, Segment, Segmented } from "@pinkslip/ui/toggle";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { feedJobs } from "../data";
import { DemoFeedRows, useDemoFeed, type DemoFeed } from "../demo-feed";
import { Group } from "../specimen";

/* The top of the Jobs page (option B): a large search field, filter chips
   under it, and the feed. A phone-sized frame with a working feed, so
   typing, filtering, and scrolling all do something. Once the header is
   settled it becomes the real feed header and this file goes away. */

/* ------------------------------------------------------------ The filters */

type Place = "remote" | "new-york" | "sf" | "seattle" | "austin";

const places: { value: Place; label: string; pattern: RegExp }[] = [
  { value: "remote", label: "Remote", pattern: /remote/i },
  { value: "new-york", label: "New York", pattern: /new york|brooklyn/i },
  { value: "sf", label: "SF Bay Area", pattern: /san francisco|mountain view|palo alto|menlo park|sunnyvale|san jose/i },
  { value: "seattle", label: "Seattle", pattern: /seattle|bellevue|redmond/i },
  { value: "austin", label: "Austin", pattern: /austin/i },
];

const pays = [
  { value: 0, label: "Any" },
  { value: 100, label: "$100K+" },
  { value: 150, label: "$150K+" },
  { value: 200, label: "$200K+" },
];

interface Filters {
  places: Place[];
  minPay: number;
  /** The ids that were new when New was turned on. Kept fixed, so a job
   * you open stays in the list instead of vanishing under your finger. */
  newIds: string[] | null;
}

const noFilters: Filters = { places: [], minPay: 0, newIds: null };

function lowestPayK(job: Job): number | null {
  const match = formatCompactSalaryText(job.salary)?.match(/(\d+(?:\.\d+)?)K/);
  return match ? Number(match[1]) : null;
}

function matches(job: Job, query: string, filters: Filters): boolean {
  const q = query.trim().toLowerCase();
  if (q && !`${job.title} ${job.company_name}`.toLowerCase().includes(q)) return false;
  if (filters.places.length && !filters.places.some((place) => places.find((p) => p.value === place)!.pattern.test(job.location))) {
    return false;
  }
  if (filters.minPay) {
    const pay = lowestPayK(job);
    if (pay === null || pay < filters.minPay) return false;
  }
  if (filters.newIds && !filters.newIds.includes(job.id)) return false;
  return true;
}

function activeCount(filters: Filters): number {
  return (filters.places.length ? 1 : 0) + (filters.minPay ? 1 : 0) + (filters.newIds ? 1 : 0);
}

function placeSummary(filters: Filters): string {
  if (!filters.places.length) return "Anywhere";
  const first = places.find((p) => p.value === filters.places[0])!.label;
  return filters.places.length === 1 ? first : `${first} +${filters.places.length - 1}`;
}

function useSearch(feed: DemoFeed) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(noFilters);
  const results = feed.jobs.filter((job) => matches(job, query, filters));
  return { query, setQuery, filters, setFilters, results, count: activeCount(filters) };
}

type Search = ReturnType<typeof useSearch>;

function PlaceChoices({ search }: { search: Search }) {
  return (
    <ToggleGroup
      multiple
      value={search.filters.places}
      onValueChange={(value) => search.setFilters({ ...search.filters, places: value as Place[] })}
      aria-label="Location"
      className="flex flex-wrap gap-2"
    >
      {places.map((place) => (
        <Chip key={place.value} value={place.value}>
          {place.label}
        </Chip>
      ))}
    </ToggleGroup>
  );
}

function PayChoices({ search }: { search: Search }) {
  return (
    <Segmented
      value={[String(search.filters.minPay)]}
      onValueChange={(next) => next[0] && search.setFilters({ ...search.filters, minPay: Number(next[0]) })}
      aria-label="Minimum pay"
      className="w-full"
    >
      {pays.map((pay) => (
        <Segment key={pay.value} value={String(pay.value)}>
          {pay.label}
        </Segment>
      ))}
    </Segmented>
  );
}

/* ------------------------------------------------------------ The frames */

/** A phone-sized screen that scrolls on its own, so sticky headers behave
 * the way they will in the app. */
function Screen({ children }: { children: ReactNode }) {
  return (
    <div
      data-screen
      className="no-scrollbar relative h-150 overflow-y-auto overscroll-contain rounded-sheet border border-line bg-bg"
    >
      {children}
    </div>
  );
}

/** Sticks to the top of the screen; draws its bottom hairline only once
 * content is scrolling under it. */
function StickyBar({ children, className }: { children: ReactNode; className?: string }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setStuck(!entry!.isIntersecting), {
      root: node.closest("[data-screen]"),
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <div ref={sentinel} aria-hidden="true" />
      <div
        data-stuck={stuck || undefined}
        className={cn(
          "sticky top-0 z-20 border-b border-transparent bg-bg/90 backdrop-blur-bar transition-colors data-[stuck]:border-line",
          className,
        )}
      >
        {children}
      </div>
    </>
  );
}

function Status({ search }: { search: Search }) {
  const n = search.results.length;
  return (
    <p className="px-4 pb-2 pt-1 text-meta tabular-nums text-ink-3">
      {n} {n === 1 ? "job" : "jobs"} · Updated 2m ago
    </p>
  );
}

function Results({ feed, search, jobs = search.results }: { feed: DemoFeed; search: Search; jobs?: Job[] }) {
  if (!jobs.length) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
        <p className="text-ui font-medium text-ink">No jobs match</p>
        <p className="text-meta text-ink-3">Try a broader search, or clear your filters.</p>
        <Button
          size="sm"
          onClick={() => {
            search.setQuery("");
            search.setFilters(noFilters);
          }}
        >
          Clear search and filters
        </Button>
      </div>
    );
  }
  return (
    <ul aria-label="Jobs" className="border-t border-line">
      <DemoFeedRows feed={feed} jobs={jobs} />
    </ul>
  );
}

/* ------------------------------------------------------------ The header */

function ChipPopover({ label, active, children }: { label: string; active: boolean; children: ReactNode }) {
  return (
    <Popover.Root>
      <Popover.Trigger data-pressed={active || undefined} className={chipClass}>
        {label}
        <ChevronDownIcon size={14} className="-mr-0.5 text-ink-3" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={6} align="start">
          <Popover.Popup>{children}</Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

function JobsHeader() {
  const feed = useDemoFeed(feedJobs);
  const search = useSearch(feed);
  const { filters } = search;
  return (
    <Screen>
      <StickyBar className="flex flex-col gap-2 pb-2 pt-3">
        <div className="px-4">
          <SearchInput
            size="lg"
            value={search.query}
            onChange={(event) => search.setQuery(event.currentTarget.value)}
            placeholder="Search jobs or companies"
            aria-label="Search jobs"
          />
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-0.5">
          <ChipPopover label={filters.places.length ? placeSummary(filters) : "Location"} active={!!filters.places.length}>
            <div className="flex flex-col gap-3">
              <span className="text-ui font-medium text-ink">Location</span>
              <PlaceChoices search={search} />
            </div>
          </ChipPopover>
          <ChipPopover label={filters.minPay ? `$${filters.minPay}K+` : "Pay"} active={!!filters.minPay}>
            <div className="flex flex-col gap-3">
              <span className="text-ui font-medium text-ink">Minimum pay</span>
              <PayChoices search={search} />
              <p className="text-meta text-ink-3">Jobs that don't list pay are left out while this is set.</p>
            </div>
          </ChipPopover>
          <Chip
            pressed={Boolean(filters.newIds)}
            onPressedChange={(on) =>
              search.setFilters({ ...filters, newIds: on ? feed.jobs.filter(feed.isNew).map((job) => job.id) : null })
            }
          >
            New
            <span className="tabular-nums text-ink-3">{feed.jobs.filter(feed.isNew).length}</span>
          </Chip>
          {search.count ? (
            <Button variant="ghost" onClick={() => search.setFilters(noFilters)} className="text-accent-text">
              Clear
            </Button>
          ) : null}
        </div>
      </StickyBar>
      <Status search={search} />
      <Results feed={feed} search={search} />
    </Screen>
  );
}

export function JobsHeaderGroup() {
  const [round, setRound] = useState(0);
  return (
    <Group id="jobs-header" title="Jobs header">
      <div className="flex flex-col gap-3 pt-3">
        <p className="max-w-prose text-body text-ink-2">
          Option B, refined. No title: Jobs is the search-first tab, and the tab bar already says where you are. The
          search field is large (44px, 16px type, so Safari doesn't zoom on focus); the chips are medium (36px, 14px
          type). New shows only the jobs with the pink dot; ones you open while it's on stay put until you turn it
          off.
        </p>
        <div>
          <Button size="sm" onClick={() => setRound((value) => value + 1)}>
            Reset
          </Button>
        </div>
      </div>
      <div className="mt-6 max-w-100" key={round}>
        <JobsHeader />
      </div>
    </Group>
  );
}
