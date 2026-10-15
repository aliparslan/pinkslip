# Apply flow: scope before drawing (2026-10-14)

Item 2 of the design inventory (`design-inventory-2026-10-14.md`), and the
part of item 3 that ships first, Ask first. The goal is to agree on the pieces
and a few decisions, then draw them in the kit.

## What's already decided

- **One Apply button** on the job page that changes state instead of adding
  buttons (`redesign-2026-10.md` §6):
  1. Apply.
  2. Apply for me (Pro), with "Apply myself" in its menu.
  3. Queued.
  4. Applying.
  5. Needs you.
  6. Applied.
  7. View in Tracker.
- **Every Apply opens our in-app browser** (Paper "In-app browser · Oct 12").
  - A top bar with the site.
  - The fill bar: "14 of 17 · 3 need you", with arrows to jump between
    blanks.
  - A toast when the board's confirmation page shows.
  - "Did that go through? · I applied" only when a submit can't be confirmed.
  - "Did you apply?" when you close it unsure.
  - Drawn before the kit; `ApplicationBrowser.tsx` is the old kit.
- **Applying for you:** the slim live bar above the tab bar (A4b, with the
  robot and a round pause) opens the queue sheet (C2: Now, Up next, Applied).
  Picked on Oct 13, drawn before the kit.
- **Auto-apply ships as Ask first:** a daily list of matches, all selected,
  one "Apply to 9". Every screen is drawn anyway (owner, 2026-10-14).
- **Built today for admin only:** level-1 assisted fill of Greenhouse and
  Ashby forms in the iOS browser (`platform/autofill`).

## What the research adds

Sources are at the end. Most are practitioner writing, so they're direction,
not proof.

1. **Ask in proportion to what can't be undone.** A submitted application
   can't be taken back, and a batch multiplies that.
   - Filling a form you submit yourself needs no friction.
   - Sending for you needs a specific preview: which jobs, which resume, the
     answers, and how many.
   - Never a bare "Are you sure?".
2. **Lead the preview with the blast radius:** "Apply to 8 jobs at 8
   companies". Show readiness per job as a small signal:
   - ready;
   - check this;
   - needs you.
   Offer "Edit before sending" beside Send.
3. **Prove it went through.** Auto-apply tools are known for saying "sent"
   when nothing was submitted. Pinkslip can show proof: the board's
   confirmation page, then the confirmation email (email tracking already
   reads it).
   - Each application says "Confirmed" or "Sent, waiting for the
     confirmation".
   - The application page keeps "Applied by Pinkslip" and a snapshot of what
     was sent.
4. **Quality over volume is a selling point.** Recruiters flag people who
   apply to many roles at one company within minutes. So guardrails should
   be visible, not hidden:
   - a cap per company;
   - match strength;
   - never answering legal or status questions;
   - a daily cap.
5. **A stop is always one tap away:** pause on the live bar, in the Live
   Activity and in the queue sheet.
6. **Live Activity (Apple's guidance):**
   - The compact and expanded views carry the same information.
   - It scales back when there's less to say.
   - Animation only on a real update.
   - Never ads.
   - Since iOS 17 it can have buttons, so Pause can live there.

## The pieces to draw, in the order someone meets them

1. **The job page's Apply button, all seven states,** in the kit (the pinned
   bar), with the morph between states.
2. **The in-app browser and fill bar,** redrawn in the kit:
   - the top bar;
   - the fill bar's states (filling, 3 need you, all filled);
   - the confirmation toast, the "Did that go through?" strip, and "Did you
     apply?".
3. **"Needs you":** answering a question the form needs:
   - in the browser;
   - from a notification;
   - in the queue sheet.
   Each answer is saved to Answers so it's never asked again.
4. **The review before sending (one sheet for two doors):**
   - Ask first's daily list, and selecting jobs on Jobs ("Apply to 8"), lead
     to the same review sheet.
   - Per-job readiness, shared questions asked once, the resume being sent,
     then Send.
5. **While it runs:** the A4b live bar and the C2 queue sheet in the kit, and
   the Live Activity (lock screen, Dynamic Island compact, expanded and
   minimal).
6. **After:** on the application page, Confirmed or Waiting for
   confirmation, "Applied by Pinkslip", and the snapshot of what was sent.

Auto-apply settings (the mode, rules and caps) come right after, as their
own round.

## Decisions for the owner

1. **Where does Ask first's daily list live** while there's no Today tab?
   - **A** · a card at the top of Jobs, "9 ready to send", opening the
     review sheet. My lean: Jobs is where you already look each day.
   - **B** · the top of Tracker.
   - **C** · only the morning notification, opening the review sheet.
2. **Is selecting jobs on Jobs ("Apply to 8") in this release,** or only Ask
   first? Either way it uses the same review sheet, so drawing it costs
   little.
3. **Assisted fill for everyone:** the roadmap gives level 1 (the browser
   filling the form, which you submit yourself) to Free users too, with
   "Apply for me" as Pro. Still right?
4. **Visible guardrails:** show the per-company cap, legal questions never
   answered, and the daily cap in the review sheet as reassurance? My lean
   is yes. It's the honest version of the trust Pinkslip sells.

## Sources

- [Human-in-the-loop AI agents: UX for approvals (Del Bueno Studio)](https://delbuenostudio.com/ai-agent-ux-human-in-the-loop/)
- [Agentic AI UX: human oversight and control patterns (UI/UX Atlas)](https://uiuxatlas.com/lessons/emerging/agentic-ai-ux-human-oversight-and-control-patterns/)
- [Designing trustworthy AI agents: 30+ UX principles](https://medium.com/techacc/designing-trustworthy-ai-agents-30-ux-principles-that-turn-wow-into-daily-habit-223da9f4d7f2)
- [Human-in-the-loop UX (Aufait UX)](https://www.aufaitux.com/blog/human-in-the-loop-ux/)
- [Live Activities, Human Interface Guidelines (Apple)](https://developer-rno.apple.com/design/human-interface-guidelines/components/system-experiences/live-activities)
- [Displaying live data with Live Activities (Apple)](https://developer.apple.com/documentation/activitykit/displaying-live-data-with-live-activities.md)
- [Live Activities design guidelines summary (9to5Mac)](https://9to5mac.com/2022/09/26/iphone-14-pro-live-activities-guidelines/)
- [The auto-apply arms race (Integral Recruiting)](https://integralrecruiting.com/the-auto-apply-arms-race-and-the-mystery-of-klaus-grant/)
- [Your auto-apply bot is lying to you (Careerhack)](https://careerhack.scalis.ai/p/your-auto-apply-bot-is-lying-to-you)
- [Do AI auto-apply bots actually work? (Hiration)](https://www.hiration.com/blog/ai-auto-apply-bots/)

## Decided (owner, 2026-10-14)

1. **Ask first's daily list lives in Today.** Today ships in this release
   with everything else. It starts nearly bare, with Ask first at the top,
   and fills out with its own design (Needs you, What changed, Coming up).
   - Open: how five tabs (Today, Jobs, Tracker, Search, You) fit the L2 tab
     bar. Decide when Today is drawn.
2. **Selecting jobs on Jobs ("Apply to 8") is drawn, and ships later.** It
   uses the same review sheet as Ask first.
3. **Assisted fill is for everyone.** "Apply for me" is Pro.
4. **The guardrails show in the review sheet:**
   - the cap per company;
   - legal and status questions never answered;
   - the daily cap.
