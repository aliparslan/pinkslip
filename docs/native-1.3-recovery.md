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

## Validation

- `bun test tests/native-release.test.ts`: 4 passed.
- Release simulator build with Xcode 27 SDK, arm64, signing disabled: passed.
- iPhone 17 simulator running iOS 27: first launch reaches Jobs, a second cold
  launch reaches Jobs, and `pinkslip://you` opens You through the scene lifecycle.
- A new signed TestFlight archive and the original physical iPhone still need
  the owner's push/build go-ahead and device verification.

## Owner testing flows

1. From the repository root run `bun test tests/native-release.test.ts`.
   Expect all four configuration regressions to pass.
2. Open `apps/native/ios/Pinkslip.xcworkspace` in Xcode, select `Pinkslip` and
   an iOS 27 simulator, then build/run Release. Expect Jobs after the splash.
   Close and reopen the app, and open `pinkslip://you`: expect the You tab.
3. Once a signed 1.3.0 build is available in TestFlight, repeat launch and
   app-link checks on the actual iPhone. TestFlight retains its required build
   number display; this app cannot hide Apple's parentheses.
