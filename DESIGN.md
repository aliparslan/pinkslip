# pinkslip design overview

## Product and core loop

pinkslip is a focused early-career job discovery app for software, data/AI,
infrastructure, and security roles. It should feel faster and calmer than a
traditional job board.

The core loop is deliberately small:

1. Discover the newest relevant jobs in Feed.
2. Evaluate a job without redundant labels or scoring language.
3. Save it, tailor materials, or apply on the original posting.
4. Return to saved and applied jobs from Me.

## Design principles

1. **The job is the signal.** Matching happens behind the interface; scores,
   relevance reasons, and feed-sort jargon do not belong in the product.
2. **One clear action hierarchy.** Primary actions are obvious, secondary actions
   stay nearby, and rare or destructive actions live behind More.
3. **Mobile, not imitation iOS.** Use familiar navigation, gestures, keyboard
   behavior, touch targets, and safe areas while keeping pinkslip's own visual
   identity.
4. **Progressive disclosure.** Search details, account management, and admin
   controls appear only where they are needed.
5. **Honest states.** Loading, empty, error, stale-data, and destructive states
   explain what happened and provide a next step.
6. **Earn every element.** Repeated headings, helper copy, decorative containers,
   and persistent controls should be removed unless they improve comprehension or
   action.

## Visual system

- Inter Variable is the primary typeface. Founders Grotesk Mono is reserved for
  compact metadata where its texture helps scanning.
- Pink is the sole brand accent. Green, amber, and red are reserved for semantic
  status, warning, and destructive states.
- Neutral surfaces, borders, and spacing establish hierarchy. Shadows are
  reserved for floating navigation, sheets, menus, and toasts.
- Lists are preferred for jobs, companies, and settings on narrow screens.
- Shared tokens and primitives define type, spacing, radii, color, buttons,
  fields, sheets, cards, and rows. Page-specific styling stays scoped.

## Information architecture

The primary navigation has two destinations:

- **Feed:** newest matching jobs, search, filters, and job detail.
- **Me:** Saved and Applied jobs, search preferences, resume profile, master
  story, tailoring setup, notifications, companies, appearance, feedback,
  account, and admin tools when authorized.

Saved and Applied are a lightweight personal job library, not a recruiting-stage
roadmap. Appearance and feedback remain inline settings rather than separate
destinations.

## Screen behavior

### Feed

Jobs are always ordered by posted date, newest first. Search and filters share a
single compact control area. Filters cover location, salary, experience, and
saved state; Reset appears only after a value changes.

Each row prioritizes company, a one-line title, posted date, normalized location,
and salary when available. Viewed styling may remain as a useful state cue. Feed
rows do not explain why a job matched.

### Job detail

The screen navigation stays compact and does not repeat the job title. Share,
Save, and More live in the header. Company and posted date lead the content;
duplicate section headings and matching explanations are omitted.

Apply and Tailor are the main actions. Mark applied and Dismiss remain directly
visible. Hide company and Report live in More. Apply opens the original posting,
so a separate Show original action is unnecessary.

### Me

Me is a grouped settings and personal-data screen rather than a dashboard. Saved
and Applied provide useful counts and direct access to those jobs. Search,
Materials, App, Account, and admin-only controls are separated by plain section
labels and compact rows.

### Supporting screens

- Companies is searchable, keeps admin controls out of the default path, and
  offers Request a company only after a search returns no match.
- Resume profile uses consistent elevated surfaces and focuses on structured
  information needed for tailoring.
- Master story is one current source of truth, with no version IDs or history.
- Onboarding asks only for information needed to create the initial feed. Role
  choices use compact pills and relocation uses a standard select.

## Accessibility and interaction baseline

- Interactive controls target at least 44 px where practical.
- Selection is not conveyed by color alone; icon-only actions have labels.
- Focus order follows visual order, custom rows support keyboard activation, and
  dialogs trap focus and close with Escape.
- Enter submits or commits a mobile field and dismisses the keyboard where the
  action is complete.
- Sheets lock the page behind them and support drag-to-dismiss from the sheet.
- Safe-area insets protect the status bar and home indicator; the tab bar stays
  out of the way while the keyboard is open.
- Reduced motion, readable contrast, and visible focus states are supported in
  both themes.

## Next priorities

1. Add automated mobile interaction and accessibility tests for the core loop.
2. Make PWA updates deterministic so deployed assets cannot remain stale.
3. Simplify Tailoring so provider, model, quota, and sync mechanics stay behind
   an optional Advanced control.
4. Split the largest feature files only at clear behavioral boundaries.
5. Improve ingestion quality and source coverage without adding feed complexity.
6. Add a wider responsive layout when desktop becomes an active product target.
