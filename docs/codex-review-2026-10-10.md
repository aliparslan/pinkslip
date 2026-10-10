# Review of Codex's commits, 2026-10-10

Commits reviewed: `b5a539c`, `4e006d7`, `3b14a66`, `294284e` and `8bc6122`,
on top of `46e2b77`. They were checked against the port plan, AGENTS.md, the
kit rules and the owner's veto list from the Phase 6 report. All five are on
`origin/main`.

## Verdict

The work is careful and solid. The launch crash fix is the right one, and the
integration work (session, autofill loop, resume OCR, website Apple sign-in)
is tested and keeps security in mind. Every veto item was handled.

There's one regression, found on the simulator during this review. Swapping
the list for SwiftUI broke the navigation bar on Jobs and Library (below).
Codex's simulator pass didn't scroll far enough to catch it, and it must be
fixed before release.

## Per commit

| Commit | What | Assessment |
| --- | --- | --- |
| `b5a539c` | iOS 27 launch crash; version 1.3.0 | **Correct.** The `.ips` traps in `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`: iOS 27 refuses apps without a scene manifest. Expo 57's `enableSceneSupport` plus `EXExpoAppSceneDelegate` is the supported fix. `tests/native-release.test.ts` runs in Xcode Cloud before archiving, so a future prebuild can't silently drop the fix or let the versions drift apart. The owner confirmed build 68 launches. |
| `4e006d7` | Veto items: native swipes, confirming actions on the right, quiet autosave, red contrast, dark icon | **Good, with one trade-off.** It finished the changes I'd left uncommitted, then replaced my Reanimated swipe with SwiftUI `List` + `SwipeActions`, so iOS supplies the real Mail behaviour (reveal, full swipe, cancel, colours). The cost: React mounts every loaded row instead of FlashList recycling them. Fine at feed sizes (it was tested to 300 rows); worth watching on the phone. Long-title width bugs were caught and fixed in the kit. |
| `3b14a66` | Autofill loop hardening, scanned-PDF OCR, session controller, link and push guards | **Good.** It cancels and times out page scripts, drops stale work when the page navigates or the sheet closes, and only a confirmed submission marks a job Applied. The session controller merges concurrent recovery and stops an old recovery from overwriting a newer sign-in. OCR renders PDF.js in a throwaway WebView (Hermes can't run it). Adds a ~1.8 MB bundled asset. `AUTO_APPLY="admin"`, with submission still manual. |
| `294284e` | Website Apple sign-in (server redirect) | **Good.** An encrypted `__Host-` flow cookie carries state, nonce, session and origin. It checks the origin on start, verifies both ID tokens with the nonce, matches the `sub`, and binds the refresh token to the client that issued it. It stays hidden until the Services ID and secrets exist. |
| `8bc6122` | Closeout docs and the external TestFlight guide | Accurate, except the "not pushed or deployed" wording is now stale: the commits are on origin, and the live AASA already lists `/jobs/*`, so the API was deployed afterwards. |

## Regression: the header no longer collapses (`4e006d7`)

Release build of `8bc6122`, iPhone 17, iOS 27, live API:

- Scrolling Jobs leaves the large "Jobs" title and the search bar fixed in
  place. Rows scroll underneath them and the text overlaps, because the bar is
  transparent. iOS collapses a large title by watching the screen's first
  scroll view. The SwiftUI `List` sits inside an Expo UI host, so the native
  stack never finds it. Library uses the same list, so it has the same problem.
- A gap of about 80pt sits between the search bar and the first row.
- Row separators now run full width. Before, they were inset to line up with
  the text, as on the web.

**Fixed with option 1** (owner's choice). The kit's `SwipeRow` is in, and
FlashList is back for Jobs, Library and the swipe gallery. On the simulator,
the title collapses to the small bar, the search bar stays pinned, separators
are inset again, and a full swipe right saves and a full swipe left hides
(with Undo). The options considered:

1. **FlashList with a hand-built full swipe:** keeps the native title, search
   bar and row recycling. The swipe is ours, so it needs to feel right on the
   phone.
2. **Keep the SwiftUI List and draw the title and search inside it:** keeps
   the system swipe, but loses the native search bar and title animation.
3. **FlashList with gesture-handler's `ReanimatedSwipeable`:** keeps the
   native header, but this reveal-buttons style is what the owner called
   "fully messed up".

## Checked here

- `bun run check` passes and `bun test` is 870 pass / 0 fail.
- Live AASA lists `/auth/email/verify*` and `/jobs/*`.

## Still open (phone or owner)

1. ~~The header regression above.~~ Fixed; feel the swipe on the phone.
2. Native swipes on touch hardware: full swipe, pull to refresh, long-press menu, VoiceOver actions.
3. Feed scrolling and memory with many pages loaded (the SwiftUI List trade-off above).
4. The Fill sheet on a real ATS form, including attaching the PDF. Stop before submitting.
5. Scanned-PDF import end to end; signed-in state surviving a force-close; email and job links when the app is cold and warm; where a real alert lands.
6. Website Apple sign-in: Services ID and secrets in the Apple portal (`docs/apple-web-sign-in-setup.md`).
7. Klim licence before the public web launch. iOS uses the system font, so the app doesn't wait on it.

## Follow-ups from the owner, same day

- **Shared links:** the app shared the link plus a line of text. Messages
  shows the rich preview for a bare link, so the app now shares only the URL.
  Apple's AASA CDN already lists `/jobs/*`. iOS fetches the file when an app
  is installed or updated, so links start opening the app after the next
  TestFlight build is installed.
- **Filter badge:** now the pink accent fill with its dark ink, not the
  system red.
- **Company logos:** a light ring showed around dark logos (Uber). The white
  tile was bleeding at the rounded corners, and the outline was white in dark
  mode. The image now carries its own white background, and the hairline sits
  on top in light mode only.
