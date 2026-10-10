# Port integration closeout, 2026-10-10

The owner approved finishing the remaining integrations and explicitly tabled
tailoring for much later. The local implementation is complete. Production
activation and the remaining signed-phone checks below are still outstanding.
Version remains **1.3.0**. No push, deployment, remote migration, Apple portal
action or distribution change was performed in this chunk. The owner's browser
and App Store Connect were not operated; no subagents were used.

## Findings and changes

| Finding | Result |
| --- | --- |
| The owner's Apple admin account opened Safari instead of the Fill browser | Read-only production inspection found both `AUTO_APPLY` and `AUTO_APPLY_SUBMIT` absent. Source now sets `AUTO_APPLY="admin"`; an authorized API deployment enables admin autofill. Submission remains manual. |
| The owner likes the dismissible Safari sheet | The Fill WebView now uses an iOS page sheet with swipe dismissal and Fill on the right. Actual drag behavior and employer forms still need the phone check. |
| Forms may appear after the initial page load; old plans may finish after navigation or dismissal | The loop watches for late forms and invalidates pending work on navigation/dismissal. The bridge cancels outstanding calls and enforces a timeout. Only confirmed submission can mark Applied. |
| Native import handled only text PDFs | Missing text now triggers local PDF.js rendering in a temporary WebView, then the existing OCR API. The first three pages have shared pixel/dimension bounds; Hermes does not execute PDF.js. |
| An import could replace the application PDF before review was accepted | The PDF is retained after acceptance. Cancel leaves the previous attachment intact. Leaving the screen or changing session discards late import results; temporary JPEGs are deleted. |
| Session recovery could race sign-in or silently fail Keychain persistence | An injected session controller coalesces initialization/recovery, serializes storage writes, exposes storage failures to Retry, and keeps a newer sign-in from being replaced by an old recovery. |
| Email-link effects, push registration and tap consumption needed lifecycle guards | Email verification is reused across effect replay and serialized for overlapping links. Push refreshes on owner change and consumes each tap once. Local link mapping rejects foreign origins. |
| Website Apple sign-in was deferred | The owner chose a redirect. Hono start/callback and the Account button are implemented; the button stays hidden without the Services ID and server credentials. State/nonce/session/access/expiry checks and matching refresh-token issuer are covered locally. |
| Port and agent guidance was stale | Plan, parity progress and release notes now distinguish implementation, fixture evidence, owner reports and pending phone/portal/deployment work. Local ignored `CLAUDE.md` was updated; directory names were left as they are. |

Production inspection on 2026-10-10 found the active API version
`2c4c3d57-6e93-4927-be09-e9a845f3871b`. APNs credentials are present. Website
Apple Services ID and the server Sign in with Apple exchange/encryption
credentials are absent. The live AASA contains only `/auth/email/verify*`;
source already includes `/jobs/*`, which needs an API deployment. These are
observed configuration gaps, not verified failures of the unactivated flows.

The additional files isolate the browser loop, Keychain controller, import
fallback policy and PDF execution from their UI adapters. This adds code and
a bundled renderer of about 1.8 MB, but gives each platform decision a clear
owner and executable regression coverage. The asset has a deterministic
generation check; the PDF.js package is a development dependency, with no
new native module or signing configuration. No kit primitive was added; the
new feature compositions are documented in Quarantine.

## Validation

- `bun run check`: passed, including token/glyph, UI governance, generated
  bindings, native/DOM renderer types, deterministic assets and CSS checks.
- `bun test`: **870 passed**, no failures, across 101 files. This includes
  seven native loop cases, five session/link cases, four import-policy cases
  and nine Apple web protocol cases using the real Hono routes and schema.
- `bun run build`: passed.
- `bun --filter @pinkslip/native export:ios`: passed, including the local
  renderer asset in the Hermes app export.
- Native WebKit suite: **7 passed**. Form fixtures prove reading/filling,
  attachment and submission detection; PDF fixtures cover text, blank,
  malformed, protected and a four-page image-only scan with a large third
  page. Rendering stays within the page/pixel bounds without network assets.
- `bun run test:e2e`: **92 passed**, including three full-screen axe/theme
  passes, kit keyboard/focus and unchanged screenshot baselines, and the new
  Account Apple POST/callback cases. No screenshot baseline was changed.
- iOS 27 Release simulator build and launch passed during this closeout.
  The unsigned build hit a Keychain entitlement failure; an ad hoc signed
  simulator build opened the live Jobs feed. This does not prove Apple/APNs
  entitlements on a physical phone or account persistence after force-close.

## Owner evidence and outstanding checks

The owner confirmed the earlier TestFlight build works on their iPhone and
native Apple sign-in succeeds. The delayed push test arrived and tapping it
opened the app. That establishes delivery and opening, not a real alert's job
destination. The force-close/sign-in persistence question is still unanswered.

Real ATS filling and PDF attachment, draggable Fill-sheet dismissal,
scanned-PDF picker → OCR service → review/retention, signed-account persistence,
cold/warm email/job links and job alert destinations remain phone checks.
Website Apple consent and account continuity require the owner's portal setup
and browser verification. Native swipes and VoiceOver remain the separate
checks in [native-1.3-recovery.md](native-1.3-recovery.md). Implementation marks
in the plan do not close these checks. Tailoring has no required work here.

## Testing flows

1. From `/Users/alip/dev/pinkslip`, run `bun run check`, `bun test`,
   `bun run build`, then `bun run test:e2e`. Expect all checks to pass. Run
   `bun --filter @pinkslip/native export:ios`, then
   `cd apps/native && bunx playwright test -c playwright.config.ts`;
   expect the renderer asset in the export and seven passing WebKit tests.
2. In a new signed build, use You → Resume to import a text PDF and then
   an image-only PDF. Synthetic local fixtures are in
   `tests/fixtures/resume-import/`; the protected fixture password is
   `fixture-password`, but password-protected imports should be rejected.
   Expect review records for usable input and clear errors for protected or
   malformed files. Cancel a replacement and check the old attachment remains;
   accept one and check the new PDF is retained. Leave during import and expect
   no late review or account change.
3. After the approved API deployment, sign in as an admin and tap Apply on
   a supported ATS job. Expect the draggable Fill sheet, known answers and
   accepted PDF attachment. Correct an answer, tap Fill, navigate to another
   form page, then dismiss during filling. Expect old work to stop and normal
   app navigation to remain usable. **Stop before submitting an application.**
4. Force-close and reopen the signed app; You → Account should remain signed
   in. Test a fresh email link while open and while closed. After AASA deployment,
   open a real `https://pinkslip.work/jobs/<job-id>` link from Notes/Messages
   in both states; expect the intended job. Send the five-second push test with
   the phone locked, then check a real job alert's destination and that a later
   launch does not replay its tap.
5. Follow [apple-web-sign-in-setup.md](apple-web-sign-in-setup.md). After setup
   and deployment, open `https://pinkslip.work/you/account` as a guest, cancel
   once, then sign in with the phone's Apple account. Expect guest continuity
   on cancel and the same saved jobs/admin role on success. Test deletion only
   with a disposable account.
6. Follow [testflight-external-testing.md](testflight-external-testing.md) to
   release to the existing external group. The portal distribution option
   and beta-review status must be checked by the owner; build 68's internal-only
   eligibility has not been inspected.
