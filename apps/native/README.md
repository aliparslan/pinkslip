# Pinkslip native prototype (1.6a / 1.6b)

Feasibility experiment, not a product app: the real Expo app is Phase 6.

## What it proves

- `packages/core`'s `createApiClient` works on native: a bearer guest session
  is minted against the local Worker (`POST /api/v2/native/session`), stored in
  the iOS keychain with `expo-secure-store`, and sent as `Authorization: Bearer`.
- `packages/data` hooks run under React Native: `useSession`, `useJobsList`,
  `useOwnerChangeCleanup`, and the shared QueryClient defaults.
- `packages/tokens/native` values are consumable directly.
- Resume import works server-side: a picked/bundled PDF is staged in app
  documents, uploaded as multipart through the shared client, parsed by the
  Worker, and the local copy can be deleted. Server errors map to user copy.
- Metro/Hermes bundles the shared TypeScript sources with no DOM or Svelte
  dependency (a root test enforces the boundary statically).

## Run it

```sh
bun run dev:web                        # webapp + API companion on :3000
bun --filter @pinkslip/native start    # Metro; press i for the iOS simulator
```

The simulator reaches the host's `127.0.0.1:3000`. A physical device needs the
dev host to bind beyond loopback and an override:
`EXPO_PUBLIC_API_URL=http://<lan-ip>:3000/api/v2 bun --filter @pinkslip/native start`.

**Resume import needs the real Worker config** (`bunx wrangler dev --port 8787`,
which has the `[ai]` binding). The webapp's API companion on :3000 deliberately
omits AI and answers `conversion_unavailable` (503). Start Metro with
`EXPO_PUBLIC_API_URL=http://127.0.0.1:8787/api/v2` for the import experiment.

## Deep-link harness

Headless runs are driven through Expo Go deep links; the app also has buttons
for manual use.

```sh
xcrun simctl openurl booted "exp://<host>:8081/--/import/text"
xcrun simctl openurl booted "exp://<host>:8081/--/import/notext"
xcrun simctl openurl booted "exp://<host>:8081/--/import/malformed"
xcrun simctl openurl booted "exp://<host>:8081/--/pick"      # system picker
xcrun simctl openurl booted "exp://<host>:8081/--/delete"    # delete local copy
xcrun simctl openurl booted "exp://<host>:8081/--/auth?token=<bearer>"
xcrun simctl openurl booted "exp://<host>:8081/--/guest"     # mint a new guest
```

`/auth` is prototype-only: it seeds the Keychain with an existing harness token
so the authenticated import path can run before sign-in (6.3).

## Observed — 1.6a data and session (iPhone 17, iOS 26.4)

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

## Observed — 1.6b resume import (iPhone 17, iOS 26.4, Worker :8787 with AI)

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
