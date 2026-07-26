# pinkslip design overview

## Product idea

pinkslip is a focused early-career job discovery tool. It should feel faster and
calmer than a traditional job board: show useful new roles, explain why they are
relevant in plain language, and help the user act without turning the search into
a dashboard.

The current product serves US new-grad and early-career candidates in software,
data/AI, infrastructure, and security roles. Product management, program
management, and product design are intentionally out of scope.

## Design principles

1. **Signal before controls.** The feed is the product. Preferences shape it,
   while sorting and filters stay compact and secondary.
2. **Useful, not falsely precise.** Relevance is expressed through human-readable
   reasons. Numeric scores, thresholds, and match tiers are implementation
   details and must not appear in the interface.
3. **One obvious next action.** Each screen has a clear primary action: continue,
   open a role, apply, tailor, or save preferences.
4. **Mobile-native rhythm.** Controls use comfortable touch targets, sticky
   actions respect safe areas, and common iOS behaviors such as swipe-back,
   haptics, and re-tapping a tab to scroll to the top are preserved.
5. **Progressive disclosure.** Advanced title rules, account details, and
   operational tools stay behind explicit controls or admin access.
6. **Honest states.** Loading, empty, error, stale-data, and destructive-action
   states always explain what is happening and provide a way forward.

## Visual language

### Typography

- **Primary and display:** Inter Variable, self-hosted through Fontsource.
- **Metadata:** Founders Grotesk Mono for compact status, time, and operational
  labels where a monospaced texture improves scanning.
- Display type uses tighter tracking; body copy favors 13–15 px sizes with
  generous line height. Small labels should remain concise because uppercase
  metadata becomes noisy quickly on a phone.

### Color

- Pink is the sole brand accent and marks identity, selection, and primary
  actions.
- Warm pink-tinted neutrals form the background and elevated surfaces in both
  light and dark themes.
- Green, amber, and red are reserved for success, warning, and destructive/error
  states; they do not represent job quality.
- Text and divider tokens provide a consistent four-level hierarchy rather than
  ad hoc opacity.

### Shape and elevation

- Corners range from 6 px for compact tags to 16 px for cards and sheets.
- Borders do most of the grouping work. Shadows are light and reserved for
  floating navigation, sheets, and toasts.
- Lists are preferred over grids for jobs and companies because they scan more
  efficiently on narrow screens.

## Information architecture

The primary navigation is deliberately reduced to two destinations:

- **Feed:** recommended jobs, search, sorting, filters, and job detail.
- **Profile:** account, search preferences, tailoring setup, notifications, and
  shortcuts to Companies, Resume profile, and Master story.

Tracker and Events are deferred. Their code and data remain available for a later
release, but they are not routes in the current product navigation.

## Screen behavior

### Onboarding

Four short steps establish target roles, work location/eligibility, optional
notifications, and optional account sync. Onboarding does not ask for a primary
role and does not insert a preview screen between preferences and the product.

### Feed

The default order is **Recommended**, with Newest and Just found as explicit
alternatives. Filters cover location, salary, experience, and saved jobs. Job
rows prioritize company, title, freshness, location, compensation, and concise
relevance reasons.

### Job detail

Company and role identity lead, followed by practical metadata and plain-language
relevance reasons. Apply and Tailor stay available in the bottom action bar.
Secondary actions—save, dismiss, hide company, and report—remain visible but do
not compete with Apply.

### Profile

Account state appears first. Every user can restart onboarding; signed-in users
can log out and restart while retaining account data, while guests receive a
clear warning that a new guest profile cannot recover the old session.

Search settings describe selected roles as a single set. Notification settings
use one job-alert switch without exposing a numeric relevance threshold.

### Companies

The company catalog is a utility reached from Profile. It supports search,
hide/restore, source reporting, and admin controls. Requests have a bounded
loading state and a visible retry path so the screen cannot remain a skeleton
indefinitely.

## Components and states

- **Primary button:** pink fill; one per decision area.
- **Secondary button:** neutral surface/border for reversible or lower-priority
  actions.
- **Danger action:** explicit red treatment plus confirmation for irreversible
  account or catalog changes.
- **Tags/chips:** selection, metadata, or relevance reasons—not numerical quality
  badges.
- **Surface card/list:** consistent container for grouped settings and scannable
  records.
- **Modal/bottom sheet:** focused confirmation or temporary controls; always has
  a clear close/cancel path.
- **Loading:** skeletons for known list structure, spinner for indeterminate
  operations, followed by an error and retry if the request times out.

## Accessibility and interaction baseline

- Interactive controls target at least 44 px where space allows.
- Selection is conveyed through state and accessible attributes, not color alone.
- Icon-only actions have labels.
- Focus order follows visual order, keyboard activation is supported on custom
  rows, and motion is brief and functional.
- Safe-area insets protect the status bar and home indicator in the iOS WebView.
- Small text and muted colors must continue to meet readable contrast in both
  themes.

## Next design priorities

1. Reduce long location strings and dense job metadata on the smallest screens.
2. Consolidate repeated micro-labels and uppercase eyebrow text.
3. Test onboarding and job-detail comprehension with new users before restoring
   more destinations.
4. Revisit Tracker and Events only after Feed, Profile, Apply, and Tailor are
   consistently reliable.
5. Add automated visual checks for light/dark themes at compact iPhone and wider
   desktop breakpoints.
