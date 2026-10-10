# Review of Codex's chunk 3.1 (2026-10-10)

Commits reviewed: `4a06aa3` (handoff assessment) and `0f5f99f` (route map and
shell navigation), against the port plan, `AGENTS.md` and the kit rules.
Reference screenshots: `docs/port-design/current/{you,preferences,library}-*`.

## Verdict

Nothing is broken. `bun run check`, `bun test` (902) and the full Playwright
suite (39 passed, 1 skipped for an empty local catalog) pass. The routing work
is solid: every planned route is registered with an explicit SSR policy, route
metadata is typed and central, the eight legacy redirects are 308s that keep
query strings, old `/#/` links migrate after hydration without a history
entry and reject protocol-relative targets, Back is a real link that works
before hydration and without JavaScript, and depth transitions respect reduced
motion. Moving `LinkButton` out of the kit (so the kit has no router import)
was a good call. The handoff assessment's four findings are accurate.

The problems are design fidelity: the shell invented navigation UI where the
current design already has an answer.

## Findings

1. **Back doesn't match the current design.** The current app has a screen
   bar: an icon-only chevron on the left, the page title centered, a hairline
   underneath, and the large title below. 3.1 added a bordered "← Back"
   secondary button above the title instead. *Fixed:* a `ScreenNav` bar in
   the shell, with the same link-with-fallback behavior.
2. **Library lost its design.** The current Library has a "Library" title and
   the Saved/Applied segmented tabs (the kit's `Tabs`, built for exactly this),
   with no nested sidebar items. 3.1 put Saved/Applied as pill links above a
   "Saved" heading on phones and nested them in the sidebar. *Fixed:* a
   Library layout with the title and link-based kit `Tabs`; no sidebar
   nesting.
3. **The shell owns You's destination list.** On phones the shell rendered a
   flat list of text links under the You heading. That list is the You
   screen's content (grouped rows: Search, Materials, App, Account), so the
   shell shouldn't render it, or Phase 4 has to undo it. *Fixed:* the You
   overview renders a grouped `Surface` list of its destinations; the shell
   only adds the nested sidebar links on wide screens, grouped like the
   current secondary nav.
4. **Labels drifted from the current copy.** "Feedback" is "Help and
   feedback" in the current app. *Fixed.* (The owner kept "Alerts".)
5. **Kit rule: section links used weight 600** for the active item. The rules
   reserve 600 for display type. *Fixed* (500, with the soft background).
6. **Raw markup in a new route.** `you.index.tsx` kept the foundation's raw
   `<p>` and unstyled `<button>` for loading and retry. *Fixed* with kit
   components.

## Notes, no change

- `router.getMatchedRoutes(path)[2]` reads like a magic index, but it is the
  tuple's `foundRoute`, so it's correct.
- Focus moves to `main` on every path change. Good for keyboard and screen
  reader users; worth re-checking once 3.2 adds redirects after sign-in.
- Admin routes are unguarded placeholders until 3.2, as documented.
