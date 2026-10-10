# Native 1.3 recovery and interaction review

Date: 2026-10-10. Continues the changes left in the working tree by the
previous agent. This is a release recovery and requested interaction follow-up
to Phase 6; it does not introduce a 2.0 release or a screen redesign.

## Launch crash

The supplied `Pinkslip-2026-10-10-161436.ips` records TestFlight **2.0.0 (67)**
on iPhone OS 27.0 (24A437). It traps on the main thread about 90ms after
launch, in `UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`,
before React starts. The committed app delegate used the old application
window lifecycle and the plist had no scene manifest.

[Apple TN3187](https://developer.apple.com/documentation/technotes/tn3187-migrating-to-the-uikit-scene-based-life-cycle)
describes the iOS 27 scene adoption requirement.
[Expo's SDK 57 build-properties plugin](https://docs.expo.dev/versions/v57.0.0/sdk/build-properties/)
supports `ios.enableSceneSupport` from Expo 57.0.23. The installed Expo
57.0.27 already includes its scene delegate.

The fix uses that supported plugin and regenerates the native configuration:

- The manifest selects `EXExpoAppSceneDelegate`, with multiple scenes off.
- `AppDelegate` provides the React factory; Expo's scene delegate owns window
  creation and React startup. Existing URL forwarding stays in the delegate.
- Version **1.3.0** agrees across Expo, the plist and both Xcode configurations.
  Bundle ID, URL scheme, signing team and shared scheme stay the same.
- Four release configuration regressions run in `bun test` and in the Xcode
  Cloud post-clone script before archiving. These catch accidental loss of
  scene support or a version mismatch after prebuild.

Apple requires `CFBundleVersion`; Xcode Cloud supplies the build sequence.
TestFlight renders version plus build, so its `1.3.0 (number)` display cannot
be hidden by this app. The public marketing version is 1.3.0 and there is no
in-app build-number label. [Apple distribution metadata](https://developer.apple.com/documentation/xcode/preparing-your-app-for-distribution)
documents the version/build distinction.

## Native swipes and remaining UI fixes

The owner selected native iOS swiping. Jobs and Library now use Expo UI's
SwiftUI `List` and `SwipeActions`, replacing the custom/Reanimated swipe code.
The system supplies reveal buttons, full-swipe thresholds and cancellation.
The existing React row content, long-press menu, query mutations, haptics and
Undo behavior remain owned by their features. Every menu action is also
available through the row's accessibility actions.

Simulator review caught unbounded Yoga widths in the first bridge: long job
titles stretched a cell beyond the screen. The kit now measures its container
and gives each hosted React row that width before SwiftUI reads its height.
The existing filled Menu adapter also constrains its nested SwiftUI trigger;
without that second constraint, a long title still measured at intrinsic width.
These measurements stay in the kit and respond to layout changes.

Leading actions: Save/Unsave in Jobs, Mark applied in Saved. Trailing actions:
Hide in Jobs, Remove in Saved, Didn't apply in Applied. Buttons use native
system colors. The new primitives are quarantined in the native kit catalog
pending the owner's visual review. Development demo: You → Kit → Native
swipes (`/you/kit-swipes`), using local examples with no account writes.

This introduces one ownership trade-off: SwiftUI lays out cells lazily, but
React mounts the rows from loaded pages instead of FlashList recycling them.
The gallery starts with 50 rows and reaches 300 through the pagination footer
to support a concrete scrolling and memory check. Device performance remains
part of the owner's review.

Apply and the resume sheet's Done now sit on the right. Native Remove uses
red text on the control surface: normal text contrast is 5.93:1 in dark and
5.55:1 in light with the existing semantic tokens. Successful autosaves have
no visible status; failures retain a Retry button. Web autosave keeps a polite
screen-reader announcement. The iOS icon uses the dark background variant.

Auto-apply availability is still controlled by the API's `AUTO_APPLY` flag
and account eligibility. Native Apply enters the application browser only
when `/me.features.auto_apply_enabled` is true. This change does not enable
that flag or alter an account.

## Validation

- `bun run check`: passed. Native type checking also passed after the row
  measurement fix.
- `bun test`: 845 passed, 0 failed, including four release regressions.
- `bun run build`: passed.
- `bun --filter @pinkslip/native export:ios`: passed.
- `bun --filter @pinkslip/native test:autofill`: 2 WebKit checks passed.
- Full web Playwright run: 87 passed; the three phone kit screenshots changed
  because the visible Saved indicators and their reserved space were removed.
  Reviewed the diffs, intentionally updated those three baselines, then ran
  all six screenshot checks without updates: 6 passed. Desktop baselines
  remained unchanged. The new autosave failure/Retry/persistence test passed
  in the full run.
- Release and Debug simulator builds: passed with Xcode 27 SDK, arm64,
  signing disabled. On iPhone 17 / iOS 27, first and second cold launches
  reach Jobs; `pinkslip://you` reaches You on both warm and cold starts through
  the scene lifecycle.
- Debug native gallery: short swipes reveal both native buttons; tapping
  Save, Unsave and Hide updates counters and row content; the accessibility
  Save action works; cancelling an open action works. Pagination starts at
  50 and reaches the visible final row and footer at 300.
- Product row review in Debug and final Release: long Coinbase titles wrap
  to two lines. A row tap in Debug
  opens its job detail after both sizing constraints are applied.
- Full-swipe execution, pull to refresh and the held-press menu did not trigger
  using the computer controls in this simulator. They use Expo's native modifiers, but
  remain unverified on touch hardware. The owner should check both on the
  actual phone before release. Physical-device performance, signed Keychain/
  APNs behavior and a new TestFlight cold launch also remain device checks.
  The unsigned simulator logs an expected notifications Keychain entitlement
  warning; it reaches the app and does not reproduce the supplied launch trap.

## Owner testing flows

1. From the repository root run `bun run check`, `bun test`, `bun run build`,
   then `bun run test:e2e`. Expect all checks to pass. The web tests include
   an autosave failure followed by Retry and reload persistence.
2. With the single web dev server running (`bun run dev`), open
   `http://localhost:3000/you/preferences`. Change a preference: it should
   save without a visible Saving/Saved badge. Open a job: Apply is the
   right-hand action. Edit a resume record: Done is on the right.
3. Open `apps/native/ios/Pinkslip.xcworkspace` in Xcode, select scheme
   `Pinkslip` and an iOS 27 simulator, and build/run Release. Expect the app
   to launch past the splash without the scene lifecycle trap. Close it,
   reopen, and background/foreground it. Native configuration checks:
   `bun test tests/native-release.test.ts`.
4. Run `bun --filter @pinkslip/native start`, build/run Debug, then open
   You → Kit → Native swipes. Short right/left drags reveal buttons; full
   drags save/hide. Reverse a save, cancel a partial swipe, scroll to the
   pagination footer and pull to refresh. Expect local counters and row
   contents to agree, and all 300 examples to remain reachable.
5. In Jobs, save/unsave a row; hide one and use Undo. In Library, mark a saved
   job applied, remove another and use Undo, then use Didn't apply in Applied.
   Check taps, long-press menus and VoiceOver actions as well as swipes.
6. A fresh signed TestFlight archive needs the owner's push/build go-ahead.
   On the actual iPhone, repeat cold launch, background/foreground, a shared
   job link and the swipe flows. Simulator success does not replace this
   final signed-device check. TestFlight will continue showing its required
   parenthesized build number.
