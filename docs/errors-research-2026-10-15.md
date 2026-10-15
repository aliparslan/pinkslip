# Errors: research (2026-10-15)

The owner asked for error screens and states as their own round, and said
some playfulness is okay. Today the app has about a dozen "X didn't load"
screens and about 25 "Couldn't X. Try again." toasts, each written on its
own (grep `EmptyState` and `toast.error` in `apps/native/src`).

## The moment

- **Who:** anyone, mid-task, often on a train or bad Wi-Fi.
- **When:** something didn't load, didn't save, or isn't there anymore.
- **First they need:** to know whether their stuff is safe, and whose
  problem it is (their connection or us).
- **Then:** the one thing that fixes it, right there, or nothing to do at
  all because we'll retry on our own.

## What the reading says

**Say it plainly, say the fix, keep their work.**
- NN/g's error-message guidelines: show the error next to its source,
  match the message to its impact (subtle for small things, blocking only
  for severe), plain words with no codes, offer a remedy, don't blame,
  and preserve what the person typed.
- Atlassian: lead with what happened and what to do; if the cause is
  unknown, don't guess. Avoid "sorry" (it makes small errors sound
  serious) and "please" (it makes a required step sound optional). Use
  "we" when it's our side, so the person doesn't feel responsible.
- Shopify Polaris (as summarised by search, the pages have moved): don't
  say "invalid", don't over-apologise, say "we" only when Shopify caused
  it, and offer a one-tap fix when one exists.
- Apple's HIG (Feedback): match the significance to the delivery; put
  status near what it describes; save alerts for critical, actionable
  things, or they lose their impact; people expect success, so "they only
  need to know when it doesn't".

**Humor: rare failures only.**
- NN/g says to avoid humor in standard errors because it goes stale on
  repeat, with one exception: a total failure (the system is down) can be
  softened with something novel.
- Mailchimp's voice guide: humor is dry and "prefer[s] winking to
  shouting"; "forced humor can be worse than none at all"; clarity beats
  entertainment, and tone follows the reader's state.
- Practitioner pieces (UX Writing Hub, Spotless, a UX Mastery thread) are
  anecdotes, not studies, and agree: a light touch, never on repeated
  failures, data loss or time pressure. In the UX Mastery thread users
  laughed at the jokes but said they preferred plain text when stuck.

**Offline: keep what you have, say what still works.**
- web.dev's offline guidelines: tell people what they can still do, not
  just that they're offline ("Messages will be sent when the network is
  restored"); the word "offline" confuses some people, so describe the
  effect; show when content was last updated; don't block the whole screen
  while a request runs; queue actions and sync when the connection is back;
  each element can have its own offline state instead of one global banner.
- Expensify's offline philosophy names five patterns: none (stale is
  fine), optimistic without feedback, optimistic with a pending look
  (0.5 opacity while offline only), a blocked form that keeps what was
  typed, and a full-page block as the last resort.

**Toasts are weak for errors you must fix.**
- GitHub's Primer doesn't recommend toasts at all; Red Hat and Maersk
  say not to put a critical error only in a toast, since it can vanish
  before it's read and sits away from its cause. PatternFly keeps toasts
  for updates that don't block the flow; a fixable problem goes inline,
  and one you must fix before going on goes in a modal.
- Our toast (T1) already says only what the screen can't, and pauses
  while touched, so it suits "that didn't save, try again" for one-tap
  actions (save, hide, move). Anything typed fails inline, next to it.

## What apps do (Mobbin)

**Whole-screen, connection:**
- [Spotify](https://mobbin.com/screens/430d2c09-a884-471d-afed-fbcc0f7ad2d4):
  "We'll be here when you're back online", then "Take a moment to enjoy
  the peace." No button; it comes back on its own. Calm with a wink.
- [Spotify offline home](https://mobbin.com/screens/ac1946e9-29ef-4953-a433-d073ed7bb066):
  keeps the content, a quiet "Offline mode" line under the tab bar, and a
  section saying what still works.
- [Qantas](https://mobbin.com/screens/18f77caf-19d5-4199-98b4-a36f34096d23):
  the large title stays, an icon, "You're not connected", Try again, and
  a toast saying the same thing again underneath, with an error code. Two
  messages for one problem.
- [Noom](https://mobbin.com/screens/2419210e-0800-41b0-b0ce-d45c385858cc),
  [HYPE](https://mobbin.com/screens/e058ad1f-07de-4aed-8eac-7944bb0c2483):
  title, one line, one Retry. Plain and fine.
- [Zomato](https://mobbin.com/screens/75f456ee-9a20-476e-9ff6-ba091ff27adb),
  [Plenty of Fish](https://mobbin.com/screens/05df64cf-e3b6-475c-a746-9c8dfe33eb88):
  a small drawn joke above plain words (a tomato bouncing off bread; a
  fishbone, "Something went wrong aboard our ship").

**Gone or broken links:**
- [Runna](https://mobbin.com/screens/20203234-1414-434c-988a-70d43491e2d3):
  "That page isn't here anymore", nothing else.
- [LinkedIn](https://mobbin.com/screens/c6df5f74-e9f6-40cf-8b87-c529b86851c9):
  "This page doesn't exist", "Go to your feed".
- [Upwork](https://mobbin.com/screens/bf10faee-2676-45ad-a7eb-bcfea69d119f):
  a UFO taking a cat, but then "Error 404 (N)" and a trace ID. The joke
  is undone by the codes.

**Playful in the brand's own objects:**
- [Swiggy](https://mobbin.com/screens/d610d8e3-37a9-4b29-85a4-c8ab289e0a7c):
  the print store is down, so the printer wears a dust cover and a
  "Back soon" tag.
- [Trainline](https://mobbin.com/screens/9ee5ddc8-c92d-4bd6-8db4-0d3e72f7c367):
  "Something's off track", "a problem at our end of the line".

**Failures in place:**
- [Quo](https://mobbin.com/screens/28233f22-360a-456d-9973-ef2942fdf2fa)
  and [HBO Max](https://mobbin.com/screens/2c6b51a6-80b2-40f0-8513-83e693c55da3)
  mark the one item that failed, where it is; tapping it offers Retry.
- [eBay](https://mobbin.com/screens/f4c64fdd-701e-4ddc-9f28-54d9cd5deda9):
  a sheet that couldn't load says so inside the sheet, with Retry.

**Asks:**
- [Spotify](https://mobbin.com/screens/f3affd56-448d-495d-9bbf-73a4b7ee6e6c),
  [Google Home](https://mobbin.com/screens/0cf5e996-e2fa-438e-974a-ce57d5ef42dd)
  and [Etsy](https://mobbin.com/screens/e139cb91-9e0e-462f-b5b7-95b45400457e)
  put "notifications are off on this phone" as one card at the top of
  their notification settings, with a button to Settings; the rows stay
  below.

## For us

1. **One question first: is it their connection, Pinkslip, or gone?**
   Each has its own words: "You're offline", "Pinkslip is down for a
   bit", "This job closed".
2. **Keep what we have.** A list that loaded once stays on screen
   offline; only a screen with nothing to show becomes an error screen.
   Never show a toast and an error screen for the same thing.
3. **Retry on our own when the connection returns,** and say so, so
   there's often no button to press.
4. **Where it shows:** a whole-screen error only when there's nothing
   else to show; a field's error on the field; a one-tap action that
   failed in the toast, with Try again; a step that must happen first
   (sign in again, update, Settings) as a card or sheet with its one
   button.
5. **Words:** what happened, then the fix, one line each. Never "invalid",
   no "sorry", "please", "oops" or codes. (The draft said "we" when it's
   ours; the owner overruled it, below.)
6. **Play only where it's rare:** a whole-screen error can carry one paper
   object with a rubber stamp (the stub's stamps), and a dry line. Offline
   gets the calm line, not a joke. Fields and toasts stay plain.

## Decided (owner, same day)

- **The round is approved** as drawn on Paper "Errors · Oct 15".
- **No "we" or "us".** Pinkslip is one person, so the app doesn't talk
  like a team: "That's on us", "We couldn't…" and "WE'RE ON IT" are gone.
  Say what happened, or name Pinkslip ("Pinkslip is down for a bit").

Sources:
- [NN/g: Error-Message Guidelines](https://www.nngroup.com/articles/error-message-guidelines/)
- [Atlassian: Error messages](https://atlassian.design/foundations/content/designing-messages/error-messages)
- [Shopify Polaris: Error messages](https://polaris-react.shopify.com/content/error-messages) (moved; read via search summaries)
- [Apple HIG: Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback)
- [Mailchimp: Voice and tone](https://styleguide.mailchimp.com/voice-and-tone/)
- [web.dev: Offline UX design guidelines](https://web.dev/articles/offline-ux-design-guidelines)
- [Expensify: Offline philosophy](https://github.com/Expensify/App/blob/main/contributingGuides/philosophies/OFFLINE.md)
- [Primer: Accessible notifications and messages](https://primer.style/accessibility/toasts/)
- [Red Hat: Alert accessibility](https://ux.redhat.com/patterns/alert/accessibility/)
- [Maersk: Toast](https://designsystem.maersk.com/components/toast/)
- [PatternFly: Alert design guidelines](https://patternfly.org/2022.07/components/alert/design-guidelines)
- [UX Mastery: Humor in error messages](https://community.uxmastery.com/t/humor-in-error-messages/6379)
- [Spotless: Using humour in UX](https://spotless.co.uk/journal/using-humour-in-ux)
