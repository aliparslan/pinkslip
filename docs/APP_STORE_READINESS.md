# Pinkslip iOS App Store readiness

This checklist is for preparing the iOS app without creating an archive,
uploading a build, or submitting it for review.

## App identity

- App name: `Pinkslip`
- Bundle identifier: `dev.alip.pinkslip`
- Marketing version: `1.0.3`
- Current development build number: `42`
- Minimum platform: iOS 15; iPhone only; portrait only
- Public privacy policy: `https://pinkslip.work/privacy`
- Public support page: `https://pinkslip.work/support`

The app display name and the App Store seller/developer name are separate. The
display name is already Pinkslip. An individual Apple Developer membership
shows the member's legal personal name as the seller. To show a company instead,
convert the membership to an organization after forming the legal entity and
obtaining its D-U-N-S number. Do this before creating/submitting the first app
record if possible, because the public developer name is chosen only once.

## Implemented in the app and service

- [x] Native app display name uses Pinkslip.
- [x] Privacy policy and support destinations are available inside Settings.
- [x] Account deletion is available inside the app.
- [x] Sign in with Apple uses a nonce and verifies Apple's signed identity token.
- [x] Apple authorization-code storage/revocation support exists server-side.
- [x] API bearer tokens are stored as one-way digests.
- [x] Magic-link consumption is atomic.
- [x] Session activity writes are throttled.
- [x] Standard Worker deploys preserve production-only remote variables.
- [x] Native privacy manifest describes app data use and required-reason APIs.
- [x] PDF.js is pinned to the security-fixed `6.2.108` release; Pinkslip's
  canvas/text paths do not instantiate PDF.js's optional scripting manager.
- [x] Native metadata requires `arm64` rather than obsolete `armv7`.
- [x] iOS shell avoids packaging PWA-only assets and service-worker behavior.

## Latest verified development state

- [x] `bun run check` passes with no TypeScript, Svelte, CSS, or binding errors.
- [x] All 379 tests pass (1,122 assertions).
- [x] Production dependency audit reports no known vulnerabilities.
- [x] Both web and iOS production asset builds compile successfully.
- [x] Xcode Debug build and static analysis complete successfully. The analyzer
  reports only upstream Capacitor/Capacitor Keyboard findings, not app-owned
  source findings.
- [x] Debug build `1.0.3 (42)` installs on a physical iPhone 14 Pro.
- [x] Production health, privacy, support, and Apple association routes respond
  successfully. The Worker deployment retained the previously live web bundle.
- [x] The v13 job classifier was replayed over the exact review-queue snapshot:
  55 need review, 4 remain approved, and 18 remain rejected.

## Required service configuration before review

- [ ] Confirm `login@pinkslip.work` receives inbound support mail, or replace
  it on both public pages with a monitored address.
- [ ] Create a dedicated Sign in with Apple private key in Apple Developer.
- [x] Set `APPLE_SIGN_IN_CLIENT_ID` to `dev.alip.pinkslip`.
- [ ] Set `APPLE_SIGN_IN_KEY_ID` and the existing `APPLE_TEAM_ID`.
- [ ] Store the `.p8` contents as the `APPLE_SIGN_IN_PRIVATE_KEY` Worker secret.
- [ ] Generate 32 random bytes, base64url encode them, and store the value as the
  `APPLE_TOKEN_ENCRYPTION_KEY` Worker secret.
- [x] Apply the `0066_apple_refresh_tokens.sql` D1 migration.
- [ ] Exercise a fresh Apple sign-in, delete that account, and confirm Apple's
  refresh token was revoked before the local account data was deleted.
- [ ] For the eventual App Store build, do not set `APNS_SANDBOX`; TestFlight and
  App Store installs use production APNs.

Use `wrangler secret put <NAME>` interactively for each secret. Do not commit
private keys or encryption material to this repository.

## App Store Connect metadata

- [ ] Create the app record using the identity values above.
- [ ] Choose the final organization/developer name before adding the first app.
- [ ] Enter the privacy and support URLs above.
- [ ] Complete the age-rating questionnaire from the actual product behavior.
- [ ] Choose the primary category and write the description, subtitle, keywords,
  promotional text, and release notes.
- [ ] Add current iPhone screenshots captured from the production-signed build.
- [ ] Enter the legal copyright owner (the LLC if ownership has transferred).
- [ ] Complete export-compliance questions; Pinkslip uses platform HTTPS/TLS.
- [ ] Provide review notes explaining guest access, optional notifications,
  Sign in with Apple, and where account deletion lives.
- [x] Production access gate is disabled, so App Review does not need a shared
  access code before reaching guest mode.

## App Privacy answers to verify in App Store Connect

Pinkslip does not use advertising or cross-company tracking. The privacy answers
must still cover data handled by Pinkslip and its service providers.

| Data category | Typical Pinkslip use | Linked to identity | Tracking |
| --- | --- | --- | --- |
| Name and email | Account and support | Yes when signed in | No |
| User ID | Account/session operation | Yes | No |
| Device ID | Push-notification token | Yes when registered | No |
| Coarse location | Job-search preferences | Yes when saved | No |
| Other user content | Resume, profile, feedback, applications | Yes when signed in | No |
| Customer support | Support and feedback messages | Yes when supplied | No |
| Product interaction | Saved/applied/seen jobs and product events | Yes when signed in | No |
| Diagnostics | Reliability and error investigation | Potentially | No |

Reconcile these answers against every production service immediately before
submission. Adding analytics, crash reporting, or another data processor can
change the disclosures.

## Final pre-submission validation (intentionally not run yet)

- [ ] Replace any development-only signing/provisioning with App Store signing.
- [ ] Create an archive and run Xcode Validate App.
- [ ] Generate and inspect Xcode's privacy report from the archive.
- [ ] Confirm the archive has the production `aps-environment` entitlement.
- [ ] Test the production-signed app on a physical iPhone: cold launch, offline
  launch, upgrade, sign-in, deep links, push open, resume upload/view, account
  deletion, and all empty/error states.
- [ ] Upload one internal TestFlight build and repeat smoke testing.
- [ ] Submit only after the privacy/support pages and reviewer credentials are
  reachable without authentication.

The current development task stops before this section: a local Debug build may
be installed on a connected phone, but no archive or distribution build is made.
