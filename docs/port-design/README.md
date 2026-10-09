# Current-design references

Captured from the frozen Svelte app at `4684819` on 2026-10-09 using the existing
API fixtures and a fixed 2026-09-01 clock. These preserve Pinkslip's visual
language for the React/Expo replacement. shadcn and Linear are aesthetic
references; neither defines our component architecture.

- [Current captures](current/manifest.json): 48 images at 390×844 and
  1440×1000, each in light and dark mode. Jobs, detail, Library, You,
  preferences, resume, companies, filters, keyboard focus, increased contrast,
  empty state and initial-load error are represented.
- `historical-baselines/`: 26 earlier Playwright baselines, retained separately.
  These were not regenerated or silently accepted as current truth.
- [Catalog snapshot](catalog-at-start.md): stable contracts, compositions,
  feature ownership and Quarantine status at the start of the port.
- Fonts and unchanged semantic CSS now also survive outside Svelte in
  [the tokens package](../../packages/tokens/README.md).

Representative current captures were visually inspected for readable content,
loaded fonts and the intended states. Captures preserve existing visual debt:
the stale-feed fixture message and existing breakpoint differences remain.
They do not approve the old Quarantine entries or any new React UI.

## Pattern map for the web kit

Paths below are relative to `packages/client/src` unless noted. The source
snapshot remains retrievable at `4684819` after deletion. Every new React
implementation starts in Quarantine; the existing reuse is evidence for a
candidate, not automatic promotion.

| Current pattern / source | Existing uses | Planned owner and behavior | Appearance / reference |
| --- | --- | --- | --- |
| Primary, secondary, danger and icon actions — `app.css` button compositions | Job detail, resume, settings, filters | Narrow action components; Base UI Button when its behavior is needed; links stay links | Control-height/radius/ink/accent tokens; detail and filters |
| Labeled text/select fields — `app.css`, `SearchProfileFields.svelte` | Preferences, resume, application answers | Field/Input/Select compositions; validation remains feature-owned | Input/control/spacing/type tokens; preferences and resume |
| Boolean controls — `Switch.svelte` | Preferences, alerts, filters | Controlled Base UI Switch with a named label | Control/selected tokens; preferences and filters |
| Choice chips — `SearchProfileFields.svelte`, `FilterChips.svelte` | Onboarding, preferences, feed filters | Base UI Toggle/ToggleGroup where selection semantics match; no new feature store | Existing chip radius/ink/selection rules; preferences and filters |
| Dialog/sheet — `Modal.svelte` | Filters, resume deletion, account confirmation, apply prep | Base UI Dialog/AlertDialog; assess Drawer for actual sheet behavior | Overlay/surface tokens, existing close target and spacing; filters |
| Menus — `app.css` menu compositions | Job row/detail, Library, Tailor | Base UI Menu; feature owns actions | Menu surface/item tokens; menu captures still needed |
| Library tabs — `JobLibrary.svelte` | Saved and Applied routes | Route-owned navigation; Base UI Tabs only where matching tab-panel semantics apply | Library capture; preserve selected state |
| Feedback — `Spinner`, `PageFailure`, `InlineFailure`, `EmptyState`, `SaveStatus` | Jobs, Library, profile/resume/settings | Semantic UI contracts; feature owns retries/autosave; use existing state hierarchy | Empty/error captures; loading/save variants still need captures |
| Toast — `Toast.svelte`, `ToastViewport.svelte` | Save/undo, delete/undo, settings feedback | Base UI Toast; domain actions passed as callbacks | Existing surface/ink/motion tokens; toast capture still needed |
| Grouped surfaces/layout — `app.css` compositions | Resume, preferences, account, companies | CSS compositions; no generic card/row prop matrix | Line/background/radius/spacing tokens; resume/preferences |
| Job and company rows — `JobRow`, `CompanyRow`, `CompanyLogo` | Jobs/Library and Companies | Feature components composed from the kit; no data fetching inside pure UI | Jobs, Library and companies captures |
| Desktop workspaces — `apps/web/src/WebApp.svelte`, `WebYouNavigation.svelte` | Jobs/detail, Library/detail, You/settings, resume | Web shell/route compositions | Wide captures; existing compositions remain Quarantine |
| Phone headers/tab navigation — `RootHeader`, `ScreenNav`, `TabBar` | Jobs, Library, You and pushed pages | Shell owns routing/platform adaptation | Narrow captures; native physical-device comparison still needed |

Semantic roles come from `tokens.css` and the preserved font definitions.
No copied pattern authorizes raw palette/type/radius/motion values. Features
may add a composition; stable primitives still require three uses or two
independent features.

## Reproduce the captures

Build the frozen web app, serve it with its existing fixture server, and run:

```sh
bun run build:frontend
# In one terminal, from apps/web:
PINKSLIP_E2E_PORT=4183 bun e2e/static-server.ts
# In another terminal, from the repository root:
bun --filter @pinkslip/webapp capture:references
```

The capture script uses a fresh browser context for each route so a persisted
feed does not mask initial-load failures. Before deleting Svelte, move the API
fixtures and any still-needed capture harness out of `apps/web` with the rest
of the parity harness.

## Remaining reference gaps

Physical iOS/Capacitor screens, loading transitions, feature menus, toast and
autosave states, and VoiceOver behavior still need evidence before their kit
or native replacements are signed off. Mobile browser screenshots are not
native-device verification. Chunk 0.4 is therefore captured/mapped with these
gaps recorded; visual approval remains separate.
