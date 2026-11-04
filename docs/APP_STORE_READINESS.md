# Pinkslip App Store launch checklist

Updated 2026-11-04 for the Expo app (release 1.3.9). This replaces the
Capacitor-era checklist (1.0.3, build 42); read that with
`git show f437db2:docs/APP_STORE_READINESS.md`.

The owner runs App Store Connect. Pushes, deploys and over-the-air updates
need the owner's go-ahead, as everywhere else.

## Where things stand

Checked in the repo or production on 2026-11-04:

- [x] App record exists. Store name **Pinkslip: Job Search & Apply** (plain
  "Pinkslip" is taken), subtitle **Job hunting, from start to end**. The
  home screen, pushes and subscriptions say just "Pinkslip".
- [x] Bundle `dev.alip.pinkslip`, iOS 16.4 and later, iPhone only, portrait.
- [x] Xcode Cloud archives every push to `main` for TestFlight, and external
  testers already get builds.
- [x] Guest mode: jobs, search and job pages work without an account. The
  production access gate is off.
- [x] Sign in with Apple, Google or an email code, and "Use my password" for
  an account that made one after a code (`password_after_code_enabled` is
  on in production). Apple sign-in sits beside Google, as guideline 4.8
  requires.
- [x] Account deletion in the app: **You → Account → Delete account**. The
  production Worker has `APPLE_SIGN_IN_PRIVATE_KEY` and
  `APPLE_TOKEN_ENCRYPTION_KEY`, so deletion can revoke Apple's token.
- [x] Push: TestFlight uses production APNs and the owner's TestFlight push
  test arrived. `APNS_SANDBOX` stays unset in `wrangler.toml`.
- [x] Export compliance: `ITSAppUsesNonExemptEncryption` is `false` in
  `Info.plist`, so builds don't ask.
- [x] `PrivacyInfo.xcprivacy` is committed. The app has no analytics,
  crash-reporting or tracking SDKs.
- [x] Public pages: [privacy](https://pinkslip.work/privacy),
  [terms](https://pinkslip.work/terms),
  [support](https://pinkslip.work/support). `support@pinkslip.work`
  forwards to the owner.
- [x] Paid Apps agreement, bank account and W-9 active. Small Business
  Program applied for on 2026-10-24.
- [x] Tailoring is hidden in the app and on the website (`tailoringShown` in
  each app's `src/features/tailoring/shown.ts`). Committed 2026-11-04, not
  yet pushed. Direct links still open its coming-soon page, which is fine.

## Decisions

Made by the owner on 2026-11-04:

- **Seller:** the owner's personal name (individual membership) for now.
  An LLC comes in a few months. Then convert this membership through
  Developer Support (subject "Account Updates and Renewals") rather than
  opening a company account and transferring the app: Sign in with Apple
  IDs belong to the team, so a transfer would mean migrating every Apple
  user. Ask Apple to confirm in writing that the Team ID stays the same,
  since Apple sign-in, push and the website's app links depend on it.
- **No AI consent prompt.** The privacy page covers the AI processing (see
  below).
- **The repository stays public.**

Still open, with the recommendation first:

1. **Pro waits for an update.** The app's StoreKit side isn't built, so this
   release sells nothing and the Plan row stays "Soon". When submitting,
   App Store Connect offers to add the two subscriptions: leave them out.
2. **Availability: the United States only.** The jobs are US jobs, the
   Stripe tip link is allowed on the US storefront only, and selling in the
   EU needs a Digital Services Act trader declaration, which shows a trader's
   address, phone and email on EU listings. For an individual, that's a home
   address. Revisit after the LLC.
3. **Version 1.3.10**, the next patch (see "The build").
4. **A review account with a password.** Guideline 2.1 asks for a demo
   account when features need one. Add a Cloudflare Email Routing address
   such as `review@pinkslip.work` that forwards to the owner (never the
   personal address), sign up with it in the app, enter the code, then
   choose a password at "Make a password". Keep it a normal account, not an
   admin. Its email and password go in App Store Connect's sign-in fields.
5. **Category:** Business, with Productivity second.

## Before submitting

### The build

- [ ] Bump to 1.3.10 everywhere `apps/native/README.md` lists, and run
  `bun test tests/native-release.test.ts`.
- [ ] Push `main` (go-ahead). Xcode Cloud builds it with tailoring hidden.
- [ ] Confirm the Xcode Cloud workflow's Archive action says **TestFlight and
  App Store** under Deployment Preparation. External testing already needs
  it, so this is probably done.
- [ ] On that TestFlight build, on the owner's iPhone:
  1. Delete the app and install fresh: onboarding, then the Jobs feed as a
     guest.
  2. Sign in with Apple, then sign out and in with Google, and with the
     review account's password.
  3. You shows no Tailoring row, and no job's ⋯ menu has "Tailor resume".
  4. Import a text PDF and a scanned PDF under You → Resume.
  5. Open Apply on a Greenhouse job and use Fill. **Stop before
     submitting.**
  6. Set up Email tracking and forward one job email.
  7. A job alert push opens its job, and a `pinkslip.work/jobs/…` link from
     Messages opens the job.
  8. Make a throwaway account with Sign in with Apple and delete it. In iOS
     Settings → your name → Sign-In & Security → Sign in with Apple,
     Pinkslip should be gone, which shows Apple's token was revoked.

### The privacy page

`shared/legal.ts` already says resume extraction and Fill's guessed answers
use Workers AI. Three things are missing:

- [ ] **Forwarded email.** Add to "Information Pinkslip collects": "Job
  emails you forward to your Pinkslip address, used to keep your
  applications' status current."
- [ ] **Application answers.** Add to "Career information": "answers you save
  for applications, including optional demographic answers such as gender,
  race, veteran and disability status."
- [ ] **Service providers.** Name all the Workers AI uses and Google: "…and
  run Workers AI models that read resumes, suggest application answers, and
  sort forwarded job emails the rules can't place. If you use Google
  sign-in, Google processes the information needed to sign you in."
- [ ] Update `LEGAL_UPDATED_AT` and deploy (go-ahead).

### App Privacy answers

App Store Connect → App Privacy. Nothing is used for tracking. Everything
below is linked to the user, for App Functionality unless noted.

| Apple's category | Data types | What it is in Pinkslip |
| --- | --- | --- |
| Contact Info | Name, Email Address | Account |
| User Content | Emails or Text Messages | Forwarded job emails |
| User Content | Customer Support | Feedback and reports |
| User Content | Other User Content | Resume, profile, saved answers, application records |
| Sensitive Info | Sensitive Info | Optional demographic answers (race, disability) |
| Identifiers | User ID, Device ID | Account; push token |
| Usage Data | Product Interaction | Saves, views, applies, hides; also Analytics, to improve the app |
| Location | Coarse Location | Saved places (typed, not GPS; declared to be safe) |
| Diagnostics | Other Diagnostic Data | Server-side error and delivery details |

Not collected: Purchases (tips stay with Stripe and the server doesn't tie
them to accounts), Financial Info, Health, Contacts, Browsing History,
Photos, Audio. **Search History:** no search-term logging was found on
2026-11-04. Check again before answering, since adding it later changes the
label.

### The listing

- [ ] Description, keywords (100 characters) and promotional text. Copy
  rules: never "we"; sell the calm after (one app, less stress), not feature
  lists or job counts; written for new grads and early- and mid-career
  people, not just students; no time promises. The owner approves the copy.
- [ ] Screenshots at 6.9-inch iPhone size (1320 × 2868), from the
  production build in the Simulator, browsing as a guest. Don't save
  anything on production.
- [ ] Category (decision 5), price Free, availability (decision 2).
- [ ] Age rating questionnaire. The Fill browser and apply links open
  employers' sites inside the app, so answer the web-access question
  honestly. A higher rating costs nothing with an adult audience.
- [ ] Copyright: "2026 " and the owner's legal name.
- [ ] Content rights: yes, the app shows third-party content (job postings,
  company names and logos from employers' public job boards).
- [ ] Privacy, support and marketing URLs (the pages above, and
  `https://pinkslip.work`).
- [ ] App Review contact details (Apple doesn't publish them).
- [ ] Version release: **Manually release this version**, so approval
  doesn't publish the app before the owner is ready.

### Review notes

A draft for the Notes field:

> Pinkslip is a job search app for people early in their careers. Jobs,
> search and job pages work without an account.
>
> The review account is in the sign-in fields: on You, tap Guest, enter the
> email, then "Use my password". Sign in with Apple, Google and a one-time
> email code also work.
>
> To delete an account: You → Account → Delete account.
>
> Notifications are optional (You → Alerts).
>
> Fill: from a job's Apply, Pinkslip opens the employer's application page
> in the app and can fill in fields from the user's resume and saved
> answers. The user checks the form and submits it themselves.
>
> Email tracking is optional: You → Email tracking gives an address to
> forward job emails to, which keeps applications' status current.
>
> Rows marked "Soon" (Outreach, Plan, Auto-apply) aren't available yet and
> don't open.
>
> Support Pinkslip, shown in the United States only, is an optional tip
> through Stripe, opened in Safari. It unlocks nothing.

## Submit

- [ ] Add the 1.3.10 build to the version, leave in-app purchases out, and
  submit.
- [ ] Once approved, release when ready.

## After approval

- Over-the-air updates carry fixes as before. Anything that changes what the
  reviewer saw goes out in a new version with review notes: Pro, auto-apply
  sends or outreach for everyone. Switching those on with a server flag
  after review runs into guideline 2.3.1 (hidden features). Outreach's
  recruiter list also runs into guideline 5.1.2, which bars compiling
  personal information about people other than the user, even from public
  sources.
- Update notes after an update with visible changes, approved by the owner.

## Later

- **Pro.** Build the StoreKit side. The Plan screen should take prices from
  StoreKit: it currently hard-codes $9.99, $24.99 and $59.99 for three
  plans, while App Store Connect has $4.99 a week and $14.99 a month. Each
  subscription needs a purchase-screen screenshot for its review, and both
  go to review with that version.
- **LLC.** File it, get an EIN and a D-U-N-S number, convert the
  membership, then redo tax and banking under the LLC. Decide on the EU
  then.
- **Klim web licence** before promoting the website (iOS uses the system
  font).

Sources: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/),
[App privacy details](https://developer.apple.com/app-store/app-privacy-details/),
[screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications).
