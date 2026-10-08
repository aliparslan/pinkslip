import { Accordion } from "@base-ui/react/accordion";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Button } from "@pinkslip/ui/button";
import { Separator } from "@pinkslip/ui/display";
import { BookmarkIcon, SearchIcon, ShareIcon } from "@pinkslip/ui/icons";
import { Drawer, DrawerHandle } from "@pinkslip/ui/overlay";
import { useToastManager } from "@pinkslip/ui/toast";
import { Chip, Segment, Segmented, Toggle } from "@pinkslip/ui/toggle";
import { useState, type ReactNode } from "react";
import { CompanyMark } from "../../components/company-mark";
import { Group, Specimen } from "../specimen";
import { IconButton } from "./actions";

/* ---------------------------------------------------------------- Search */

const roleChoices = ["Software Engineer", "Machine Learning Engineer", "Data Engineer", "Security Engineer"];
const placeChoices = [
  { value: "remote", label: "Remote, US", share: 0.22 },
  { value: "nyc", label: "New York", share: 0.18 },
  { value: "sf", label: "SF Bay Area", share: 0.2 },
  { value: "sea", label: "Seattle", share: 0.09 },
  { value: "aus", label: "Austin", share: 0.06 },
  { value: "chi", label: "Chicago", share: 0.05 },
];
const levelChoices = [
  { value: "any", label: "Any", factor: 1 },
  { value: "intern", label: "Internship", factor: 0.3 },
  { value: "new-grad", label: "New grad", factor: 0.45 },
  { value: "early", label: "Early career", factor: 0.55 },
];

/** A plausible count for the demo, so the button changes as choices change. */
function estimateJobs(role: string, places: string[], level: string): number {
  const roleFactor = role ? 0.3 : 1;
  const placeFactor = places.length
    ? Math.min(1, places.reduce((sum, place) => sum + (placeChoices.find((p) => p.value === place)?.share ?? 0), 0))
    : 1;
  const levelFactor = levelChoices.find((choice) => choice.value === level)?.factor ?? 1;
  return Math.max(1, Math.round(2184 * roleFactor * placeFactor * levelFactor));
}

function placesSummary(places: string[]): string {
  if (places.length === 0) return "Anywhere in the US";
  const first = placeChoices.find((p) => p.value === places[0])?.label ?? "";
  return places.length === 1 ? first : `${first} and ${places.length - 1} more`;
}

function SearchSection({
  value,
  label,
  summary,
  question,
  children,
}: {
  value: string;
  label: string;
  summary: string;
  question: string;
  children: ReactNode;
}) {
  return (
    <Accordion.Item value={value} className="ps-card overflow-hidden rounded-surface">
      <Accordion.Header>
        {/* The closed summary and the open question share one cell and
            cross-fade: the summary lifts away as the question rises in.
            Visibility keeps only the shown one in the button's name. */}
        <Accordion.Trigger className="group grid w-full cursor-pointer px-4 py-4 text-left focus-ring">
          <span className="col-start-1 row-start-1 flex items-center justify-between gap-4 self-center transition-[opacity,translate,visibility] dur-fast ease-out group-data-[panel-open]:invisible group-data-[panel-open]:-translate-y-1 group-data-[panel-open]:opacity-0">
            <span className="text-ui text-ink-3">{label}</span>
            <span className="truncate text-ui font-medium text-ink">{summary}</span>
          </span>
          <span className="invisible col-start-1 row-start-1 translate-y-1 font-heading text-title tracking-heading text-ink opacity-0 transition-[opacity,translate,visibility] dur-base ease-out group-data-[panel-open]:visible group-data-[panel-open]:translate-y-0 group-data-[panel-open]:opacity-100">
            {question}
          </span>
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Panel className="motion-collapse h-(--accordion-panel-height)">
        <div className="px-4 pb-4">{children}</div>
      </Accordion.Panel>
    </Accordion.Item>
  );
}

function SearchPill() {
  const [role, setRole] = useState("Software Engineer");
  const [places, setPlaces] = useState<string[]>(["nyc"]);
  const [level, setLevel] = useState("new-grad");
  const [section, setSection] = useState<string[]>(["role"]);
  const count = estimateJobs(role, places, level);
  const levelLabel = levelChoices.find((choice) => choice.value === level)?.label ?? "Any";

  return (
    <Drawer.Root>
      <Drawer.Trigger
        render={
          <button
            type="button"
            className="ps-pill ps-press flex h-15 w-full max-w-110 cursor-pointer items-center gap-3 rounded-pill pl-5 pr-2 text-left focus-ring"
          />
        }
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-ui font-medium text-ink">{role || "Any role"}</span>
          <span className="truncate text-meta text-ink-3">
            {placesSummary(places)}, {level === "any" ? "any level" : levelLabel.toLowerCase()}
          </span>
        </span>
        <span className="ps-btn ps-btn--primary flex size-11 shrink-0 items-center justify-center rounded-pill" aria-hidden="true">
          <SearchIcon size={18} />
        </span>
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop />
        <Drawer.Viewport>
          <Drawer.Popup className="bg-sunken">
            <DrawerHandle />
            <Drawer.Content>
              <Drawer.Title className="sr-only">Search jobs</Drawer.Title>
              <Accordion.Root value={section} onValueChange={setSection} className="flex flex-col gap-3 pt-1">
                <SearchSection value="role" label="Role" summary={role || "Any role"} question="What role?">
                  <ToggleGroup
                    value={[role]}
                    onValueChange={(next) => setRole(next[0] ?? "")}
                    aria-label="Role"
                    className="flex flex-wrap gap-2"
                  >
                    {roleChoices.map((choice) => (
                      <Chip key={choice} value={choice}>
                        {choice}
                      </Chip>
                    ))}
                  </ToggleGroup>
                </SearchSection>
                <SearchSection value="where" label="Where" summary={placesSummary(places)} question="Where do you want to work?">
                  <ToggleGroup
                    multiple
                    value={places}
                    onValueChange={setPlaces}
                    aria-label="Locations"
                    className="flex flex-wrap gap-2"
                  >
                    {placeChoices.map((choice) => (
                      <Chip key={choice.value} value={choice.value}>
                        {choice.label}
                      </Chip>
                    ))}
                  </ToggleGroup>
                </SearchSection>
                <SearchSection value="level" label="Level" summary={levelLabel} question="What level?">
                  <Segmented value={[level]} onValueChange={(next) => next[0] && setLevel(next[0])} aria-label="Level" className="w-full">
                    {levelChoices.map((choice) => (
                      <Segment key={choice.value} value={choice.value}>
                        {choice.label}
                      </Segment>
                    ))}
                  </Segmented>
                </SearchSection>
              </Accordion.Root>
              <div className="mt-5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setRole("");
                    setPlaces([]);
                    setLevel("any");
                    setSection(["role"]);
                  }}
                  className="cursor-pointer rounded-item px-1 text-ui font-medium text-ink underline decoration-line-2 underline-offset-4 focus-ring"
                >
                  Clear all
                </button>
                <Drawer.Close render={<Button variant="primary" size="lg" />}>
                  <SearchIcon size={16} />
                  <span className="tabular-nums">Show {count.toLocaleString("en-US")} jobs</span>
                </Drawer.Close>
              </div>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/* ------------------------------------------------- Job detail, sticky bar */

function JobDetail() {
  const toasts = useToastManager();
  const [saved, setSaved] = useState(false);

  function save(next: boolean) {
    setSaved(next);
    if (next) {
      toasts.add({
        title: "Saved to Library",
        description: "Software Engineer, New Grad at Ramp",
        data: { leading: <CompanyMark name="Ramp" size="sm" /> },
        actionProps: { children: "Undo", onClick: () => setSaved(false) },
      });
    }
  }

  return (
    <div className="relative h-140 max-w-110 overflow-hidden rounded-sheet border border-line bg-bg">
      <div className="no-scrollbar flex h-full flex-col overflow-y-auto">
        <div className="flex flex-col gap-4 px-5 pb-8 pt-5">
          <div className="flex items-start justify-between gap-3">
            <CompanyMark name="Ramp" size="lg" />
            <div className="flex items-center gap-1">
              <Toggle size="icon" pressed={saved} onPressedChange={save} aria-label={saved ? "Saved" : "Save job"} className="ps-pop">
                <BookmarkIcon size={18} className="ps-pop-icon" fill={saved ? "currentColor" : "none"} />
              </Toggle>
              <IconButton label="Share">
                <ShareIcon />
              </IconButton>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-ui text-ink-2">Ramp</span>
            <h3 className="text-heading">Software Engineer, New Grad</h3>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-meta text-ink-2">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-pill bg-good" aria-hidden="true" />
              Posted 4 minutes ago
            </span>
            <span>New York, hybrid</span>
            <span>Hires through Ashby</span>
          </div>
          <Separator />
          <section className="flex flex-col gap-2">
            <h4 className="text-ui font-medium text-ink">About the role</h4>
            <p className="text-ui text-ink-2">
              You will build the systems that move money for 30,000 businesses: card authorization, bill pay, and the
              ledger underneath them. New grads join a team of six and ship to production in their first two weeks.
            </p>
          </section>
          <section className="flex flex-col gap-2">
            <h4 className="text-ui font-medium text-ink">What you will need</h4>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-ui text-ink-2">
              <li>A degree in computer science or equivalent experience, finishing by June 2027</li>
              <li>One internship or substantial project in a typed language</li>
              <li>Comfort with SQL and reading other people's code</li>
            </ul>
          </section>
          <section className="flex flex-col gap-2">
            <h4 className="text-ui font-medium text-ink">Benefits</h4>
            <p className="text-ui text-ink-2">
              Equity, full health coverage, a learning budget, and relocation support for the New York office.
            </p>
          </section>
        </div>
        <div className="sticky bottom-0 mt-auto flex items-center justify-between gap-4 border-t border-line bg-raised/95 px-5 py-3 backdrop-blur-bar">
          <div className="flex min-w-0 flex-col">
            <span className="text-ui font-medium tabular-nums text-ink">$160k–$190k</span>
            <span className="text-meta text-ink-3">Base salary, as listed</span>
          </div>
          <Button variant="primary" size="lg">
            Apply
          </Button>
        </div>
      </div>
    </div>
  );
}

export function PatternsGroup() {
  return (
    <Group id="patterns" title="Patterns">
      <Specimen
        name="Search pill"
        use="Search and filters in one control at the top of the feed. It opens a full search, one question at a time, and the button counts matching jobs as you choose."
      >
        <SearchPill />
      </Specimen>
      <Specimen
        name="Sticky Apply bar"
        use="On a job, salary and Apply stay under your thumb while the description scrolls. Saving pops the mark and confirms with an Undo."
      >
        <JobDetail />
      </Specimen>
    </Group>
  );
}
