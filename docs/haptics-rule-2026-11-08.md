# One rule for haptics (proposed, Nov 8)

Roadmap §2, directions A10. Today there are 39 haptic calls outside the
kit and no written rule. Most are already right; what follows is the rule they
mostly follow, then the seven that break it.

## The rule

A buzz says something happened that you'd otherwise have to look for. One
per moment, never two for the same thing.

| Kind | When | Examples in the app |
| --- | --- | --- |
| **Success** (iOS's success notification) | Something left you and arrived, or a long flow finished | An application recorded (the torn stub caught in its button), SENT landing on the live bar, the board confirming a send, a message or feedback sent, a support payment, signing in, finishing onboarding or email setup |
| **Tap** (light impact) | Something physical happened where you're looking | A stamp meeting the paper, each tick of the rip, Save filling in, "I applied" from a row, Copy, a card thrown in onboarding |
| **Tick** (selection) | Moving through choices | Picking an answer chip in onboarding (wheels and pickers tick on their own) |
| **Warning** | Pinkslip said no | A send refused (the daily limit, a closed job) |
| **Error** | Something failed | Comes with every error toast (already) |
| **Nothing** | Everything else | Scrolling, switching tabs, opening and closing pages and sheets, menus, swipes, saving a setting (Your search, a date), moving a stage (its stamp taps as it lands) |

## What changes

| Where | Today | Proposed | Why |
| --- | --- | --- | --- |
| Applying from the job page, through the browser (`useJobPage.tsx`, `appliedThroughBrowser`) | Success when the server answers, then success again as the stub is caught | Only the catch | Two successes for one application, about a second apart |
| Changing a stage (`ApplicationPage.tsx`, `setStage`) | Success as the sheet closes | Nothing | The new stamp taps as it lands; the success came first and doubled it |
| Saving a stage's date (`ApplicationPage.tsx`, the date step) | Success | Nothing | A setting |
| Fixing a step's date (`ApplicationPage.tsx`, the stamp's date sheet) | Success | Nothing | A setting |
| Saving Your search (`EditSearch.tsx`) | Success | Nothing | A setting; the sheet closing says it's saved |
| Matching a job email to an application (`JobEmailsPage.tsx`) | Success | Nothing | The application's stamp lands when you open it |
| A send refused (`useSendFlow.tsx`, `showRefusal`) | Nothing | Warning | Pinkslip said no; today only the sheet says so |

Kept as they are: the stub's rip and catch, stamps, Save, "I applied" from a
row (tap, then success when it's recorded), Copy, the onboarding cards and
chips, SENT on the bar, the board's confirmation on the job page (the bar is
hidden there, so it never doubles), outreach and feedback sent, sign-in,
email setup, the support thank-you, and error toasts.

## After you approve

The rule goes into `docs/design-system.md` beside Motion, the seven changes
are made in one commit, and a short test checks that no file outside
`src/platform/haptics.ts` calls `expo-haptics` directly.
