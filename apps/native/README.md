# Pinkslip for iOS (Expo)

The native app (port plan Phase 6): Expo SDK 57, Expo Router (native tabs and
stacks), a Unistyles kit themed from `@pinkslip/tokens`, and the shared
`@pinkslip/core` / `@pinkslip/data` layers. Same bundle ID as the Capacitor
app (`dev.alip.pinkslip`), so it ships as an update.

## Layout

- `src/app/`: routes. `(tabs)` holds the Jobs, Library and You stacks;
  `(jobs,library)/jobs/[jobId]` is shared, so a job opens inside whichever tab
  you're in.
- `src/kit/`: the native kit (D8). Same semantic names and props as the web kit
  where the behavior matches; menus and segmented controls are the system's
  (Expo UI). Dev-only gallery: You → Kit.
- `src/platform/`: session (Keychain bearer token), Sign in with Apple, the
  persisted Query cache (MMKV), push (raw APNs tokens for `worker/apns.ts`),
  links, haptics, share.
- `src/theme/`: four themes (dark, light, and their increased-contrast
  variants) chosen from the system scheme, iOS Increase Contrast and the You →
  Appearance pin.
- `ios/`: committed for Xcode Cloud (`ci_scripts/ci_post_clone.sh` installs
  Node, Bun and CocoaPods). Re-run prebuild after native config changes:
  `CI=1 bunx expo prebuild --platform ios --no-install`. It regenerates
  `ios/` and deletes files it doesn't know, so restore them afterwards with
  `git checkout -- ios/ci_scripts ios/Podfile.lock ios/Pinkslip/PrivacyInfo.xcprivacy ios/Pinkslip.xcworkspace`,
  then `LANG=en_US.UTF-8 pod install` in `ios/`.
  Preserve `expo-build-properties` → `ios.enableSceneSupport` in `app.json`;
  iOS 27 requires the scene lifecycle. After regeneration, align both
  `MARKETING_VERSION` entries in the Xcode project with `expo.version`, then
  run `bun test tests/native-release.test.ts` from the repository root. This
  check also runs in Xcode Cloud before the archive.

The release version is **1.3.1**. Apple requires a separate build number;
Xcode Cloud supplies it, and TestFlight displays it in parentheses. The app
does not display that number. See [the recovery notes](../../docs/native-1.3-recovery.md)
for the launch diagnosis and local verification flows.

## Run it

```sh
bun --filter @pinkslip/native start         # Metro for the development build
```

Build the development app once with Xcode (or `xcodebuild`) from
`ios/Pinkslip.xcworkspace`, scheme `Pinkslip`, then open it in the simulator.
It talks to production (`https://pinkslip.work/api/v2`) unless
`EXPO_PUBLIC_API_URL` points elsewhere, e.g. the local Worker:
`EXPO_PUBLIC_API_URL=http://127.0.0.1:3000/api/v2 bun --filter @pinkslip/native start`.

## Feasibility notes from 1.6

### 1.6a data and session (iPhone 17, iOS 26.4)

- [x] First launch mints a guest session; the screen shows `session: guest`.
- [x] Relaunch reuses the keychain token: terminating Expo Go and reopening
      stays `guest` without minting a new session.
- [x] Job titles from the local D1 catalog render.
- [x] No DOM/red-screen errors; the only logged warning is the
      `SafeAreaView` deprecation below.
- [x] Rotate token: the first tap exposed a real bug. `clearPersonalQueries`
      used `removeQueries` while the jobs hook was mounted, which orphaned the
      query in a permanent pending state. Fixed to `resetQueries` plus removal
      of inactive entries only, with a regression test.

### 1.6b resume import (iPhone 17, iOS 26.4, Worker :8787 with AI)

- [x] The staged attachment lands in app documents and survives; `delete`
      removes it (`local file: none`).
- [x] Multipart upload works when the file is passed as an expo-file-system
      `File` (which implements Blob). The classic `{ uri, name, type }` part
      fails in Expo's native fetch with `Unsupported FormDataPart
      implementation`; this is the adapter requirement for 6.9.
- [x] A guest gets `401 authentication_required` ("Sign in to import a
      resume."); the `/auth` harness token switches the screen to
      `session: authenticated`.
- [x] Text PDF → 200: `JANE DOE`, `jane@example.com`, counts
      `experience 1 / education 1 / projects 0 / skills 1 / additional 0`,
      0 warnings.
- [x] No-text PDF → 422 `no_extractable_text` ("No readable resume text was
      found. Try a text-based PDF.").
- [x] Malformed file → 422 `invalid_pdf` ("This file is not a valid PDF.
      Choose another file.").
- [x] Server `/resume-import/ocr` with a rendered page PNG → 200 parsed
      profile in ~3.5 s.
- [ ] System picker (`Pick PDF`) needs a manual tap and a PDF in Files.
- [ ] Scanned PDF end-to-end on native: blocked on local page rendering.

## D10 outcome

- **Text PDFs:** server-side parse is the path; validated end-to-end from
  native. No WebView needed.
- **Scanned PDFs:** the server returns `no_extractable_text`. The web fallback
  renders pages with PDF.js and posts images to `/resume-import/ocr`, which
  works (validated with a rendered PNG). Hermes has no PDF renderer, so 6.9
  must either render pages natively and call `/ocr`, or run the existing
  PDF.js path in a hidden WebView. Recommendation: hidden WebView, since a
  WebView is already required for the application browser (6.10); a native
  renderer is the fallback if the WebView proves too heavy.
- **Auth:** resume import requires a signed-in session, so 6.3 must land before
  6.9's product flow.

## Known gaps for 6.x, recorded during this experiment

- Native font families need a single family name plus bundled fonts; the
  generated values keep the web fallback list, so this prototype uses the
  system font. The native kit (6.2) owns loading and mapping.
- Real owner changes require sign-in (email magic link / Apple). This app can
  only exercise guest-session rotation until 6.3 lands.
- The app has no invite-gate handling: with `ACCESS_CODE` configured,
  `/native/session` returns `access_required` and startup shows that error.
- `SafeAreaView` from `react-native` is deprecated in RN 0.86; the native kit
  should use `react-native-safe-area-context`.
- Upload cancellation is not wired: the shared `request` helper owns its
  AbortController and replaces a caller-provided signal, so a cancel button
  needs signal composition in `core`.
