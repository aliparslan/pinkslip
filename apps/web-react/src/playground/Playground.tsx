import { Tooltip } from "@pinkslip/ui/floating";
import { Toaster, ToastProvider } from "@pinkslip/ui/toast";
import { ActionsGroup } from "./sections/actions";
import { ChoicesGroup } from "./sections/choices";
import { DisclosureGroup, DisplayGroup, FeedbackGroup } from "./sections/display";
import { EntryGroup } from "./sections/entry";
import { MenusGroup } from "./sections/menus";
import { OverlaysGroup } from "./sections/overlays";
import { PartsGroup } from "./sections/parts";
import { PatternsGroup } from "./sections/patterns";
import { PickersGroup } from "./sections/pickers";
import { RangesGroup } from "./sections/ranges";
import { JobPageGroup } from "./sections/job-page";
import { JobsHeaderGroup } from "./sections/jobs-header";
import { TrackGroup } from "./sections/track";
import { TunePanel, useTune } from "./tune";

const sections = [
  ["track", "Track"],
  ["job-page", "Job page"],
  ["jobs-header", "Jobs header"],
  ["parts", "Parts"],
  ["patterns", "Patterns"],
  ["actions", "Actions"],
  ["entry", "Text entry"],
  ["choices", "Choices"],
  ["ranges", "Ranges"],
  ["pickers", "Pickers"],
  ["overlays", "Overlays"],
  ["menus", "Menus"],
  ["feedback", "Feedback"],
  ["disclosure", "Disclosure"],
  ["display", "Display"],
] as const;

export function Playground() {
  const [tune, setTune] = useTune();

  return (
    <ToastProvider limit={3}>
      <Tooltip.Provider delay={400}>
        <header className="sticky top-safe z-40 border-b border-line bg-bg/95 backdrop-blur-bar">
          <div className="mx-auto flex h-14 max-w-170 items-center justify-between gap-4 px-4 sm:px-6">
            <span className="font-heading text-lead tracking-heading text-accent-text">pinkslip</span>
            <TunePanel tune={tune} setTune={setTune} />
          </div>
        </header>

        <main className="mx-auto max-w-170 px-4 pb-24 pt-8 sm:px-6">
          <h1 className="text-display">Components</h1>
          <p className="mt-3 max-w-prose text-body text-ink-2">
            The parts pages are built from, then product patterns, then all 38 Base UI components, with real Pinkslip content. One style, tactile,
            in Raspberry. Open View to switch the theme, slow motion down, or preview reduced motion.
          </p>
          <nav aria-label="Sections" className="no-scrollbar -mx-1.5 mt-6 overflow-x-auto">
            <ul className="flex w-max gap-0.5">
              {sections.map(([id, label]) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="inline-flex h-8 items-center rounded-pill px-3 text-meta font-medium text-ink-2 transition-colors hover:bg-control hover:text-ink focus-ring"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <TrackGroup />
          <JobPageGroup />
          <JobsHeaderGroup />
          <PartsGroup />
          <PatternsGroup />
          <ActionsGroup />
          <EntryGroup />
          <ChoicesGroup />
          <RangesGroup />
          <PickersGroup />
          <OverlaysGroup />
          <MenusGroup />
          <FeedbackGroup />
          <DisclosureGroup />
          <DisplayGroup />

          <p className="mt-16 text-meta text-ink-3">
            Built on Base UI 1.8. Set in Untitled Sans and Founders Grotesk.
          </p>
        </main>
        <Toaster />
      </Tooltip.Provider>
    </ToastProvider>
  );
}
