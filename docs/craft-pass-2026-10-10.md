# Craft pass: iOS and mobile web (2026-10-10)

The owner installed Emil Kowalski's skills and asked for them to be applied to
the current iOS app and mobile web, desktop excluded. The skills used:
`animate-expo`, `mobile-native`, `apple-design`, `emil-design-eng`, and the
audit gates from `improve-animations` and `find-animation-opportunities`. The
other skills don't apply yet:
- `break-ui` (stress data) is a separate pass, worth running on the job row.
- `ask-sonner` doesn't apply: the toasts are Base UI and our own.
- `write-swift` doesn't apply: there's no Swift of our own.

## What was already right

- **iOS chrome is the system's:**
  - The native tab bar, with tab switches that don't slide.
  - Native stack pushes and large titles that collapse.
  - Page sheets, context menus, the segmented control and switches.
  - Pull to refresh.
  - 120Hz is on (`CADisableMinimumFrameDurationOnPhone`).
  - None of this was touched.
- **The swipe row:** gestures and motion run on the UI thread, haptics fire
  when the action arms, and a flick commits.
- **The web kit:**
  - Buttons, icon buttons and chips scale to 96% on press.
  - Every kit hover is limited to mouse pointers.
  - Inputs are 16px on phones, so Safari doesn't zoom.
  - Sheets use `translateY(100%)` with Base UI's swipe-to-dismiss.
  - Toasts enter and leave from the same edge.
- **Deliberately left alone:**
  - The tokens' Reduce Motion behaviour, which sets every duration to 1ms.
  - The route slide (View Transitions).
  - Both are earlier decisions with their reasons recorded.

## Changes

### iOS

| Before | After | Why |
| --- | --- | --- |
| Buttons dimmed to 72% opacity on press, instantly | `PressableScale`: content scales to 97% on touch-down, 140ms strong ease-out (`--ease-out`), on the UI thread; matches the web button | Feedback should land on press, and scale reads as physical where a dim reads as disabled |
| Chips dimmed to 70% on press | Same 97% press scale | Same reason; chips are tapped in bursts during onboarding and filters |
| Checkbox had no press feedback | The box gives (92%) under the finger | Every pressable needs a response |
| Swipe row snapped back on a fixed spring that ignored release speed | Settles with the finger's velocity (`duration 380, dampingRatio 1`, overshoot clamped so the other side's action never peeks) | Motion should continue from the gesture, not restart |
| A committed swipe slid out on a 180ms default (ease-in-out) tween | 180ms strong ease-out (`--ease-out`) | It leaves fast from the first frame, so it reads as continuing the throw. A velocity spring was tried, but its long settle held an empty red strip on screen for about half a second before the list dropped the row |
| Grabbing a row mid-animation jumped it back to the finger's start | The drag picks the row up where it is; catching a row on its way out cancels the action | Interruptibility: start from the on-screen value |
| The side without an action stopped dead at 14pt | Rising resistance (rubber band) | Boundaries should resist, not hit a wall |
| The gesture was rebuilt every render | Built once per row shape; actions read at commit | A re-render mid-drag could reattach the recognizer |
| Toasts faded in on Reanimated's default ease-in-out | Strong ease-out on entry | Entrances should start fast |
| Toasts could only time out (Undo stays 7s over the list) | Swipe down to dismiss; follows the finger, resists upward, a flick is enough | A surface should leave the way it came, on demand |
| Onboarding steps cross-faded | Each step enters from the side you're heading (back comes from the left); Reduce Motion fades | Spatial consistency: forward and back read as directions |
| The progress segments switched colour | The fill grows into each segment (220ms ease-out) | State indication on a rare, first-run screen |
| Disclosure swapped a right caret for a down caret | One caret turns 90°; the content fades in | The turn explains the state change |

### Mobile web

| Before | After | Why |
| --- | --- | --- |
| The viewport had no `viewport-fit=cover` (lost in chunk 3.4; the Svelte site had it), so every `--safe-top`/`--safe-bottom` was 0 | Restored | The header, tab bar, sheets and onboarding already pad by the safe areas; without it they never did |
| One dark `theme-color` in both modes | One tag per colour scheme; a mode chosen in Appearance repaints both | Light mode had a dark status bar and toolbar tint (Chrome, installed web app) |
| "System" appearance only followed the OS while You was open | `ThemeEffects` at the root follows it on every page | It stayed in the old mode until a reload |
| iOS painted a grey flash over every tapped control | `-webkit-tap-highlight-color: transparent`; controls keep their own pressed states | The flash is the loudest "this is a website" tell |
| Job rows, You rows and resume rows had no pressed state on touch | Rows light up on press after a short delay and fade back on release | Feedback without rows flashing as a scroll starts, as iOS lists do |
| The tab bar had no press feedback; long-pressing a tab opened Safari's link preview | 96% press scale; no callout or text selection on tabs | Tabs should behave like tabs |
| Long-pressing a chip, icon button, toast action or menu item could select its label | `user-select: none` with Safari's `-webkit-` prefix (the build doesn't prefix) | Control labels aren't content |
| Five hover rules weren't limited to mouse pointers: the You section links, "View original posting", company names, admin links, the rail tabs | Inside `(hover: hover) and (pointer: fine)` | Taps left them stuck in the hover state |
| Double-tapping a control quickly could zoom the page | `touch-action: manipulation` on controls | A second tap is a second tap |
| Landscape text could inflate | `text-size-adjust: 100%` | Layout stays as designed |

## Rejected

- **Animating tab switches or adding entrance animations to rows:** these happen
  dozens of times a day, and the rows are in a virtualized list.
- **A "pop" on the bookmark when saving:** the haptic and the filled icon
  already confirm it, and saving happens often.
- **A custom pull to refresh:** the system control is right.
- **Changing the web sheet curve to the iOS drawer curve:** the phone override
  is already a strong ease-out, so the gain is too small to justify a token
  change.
- **Closing the gap when a row leaves (tried, then dropped):** Mail-style
  rows sliding up into the space a hidden row leaves.
  - I tried React Native's `LayoutAnimation` with FlashList's
    `prepareForLayoutAnimationRender`, the approach FlashList documents.
  - The animation ran (its completion callback fired), but the rows still
    jumped.
  - FlashList measures after each render and moves the rows in a follow-up
    render. Setting the animation up again just before that render didn't
    help either.
  - This was on a Release simulator build, checked with a screen recording at
    1.5s and timing logs.
  - Left out rather than shipped half-working. A possible route later is a
    `CellRendererComponent` that animates its own position.

## Needs the phone

Checked on the iPhone 17 simulator (Release build, iOS 26.4):
- Swipe to hide and remove, with the toast.
- Undo through the new gesture layer.
- Swipe down to dismiss (with a temporarily long toast, to rule out the
  timer).
- Onboarding forward and back.
- The progress fill.
- Buttons and chips laying out as before.

The simulator can't judge feel, though. On a Release build on the phone,
check:

1. The press scale on Apply, Save and the filter chips.
2. A swipe row in both directions:
   - Flick it.
   - Release it short of the commit point.
   - Catch it mid-slide.
   - Drag toward the side with no action.
3. Swipe the Undo toast down, and tap Undo.
4. Onboarding forward and back.

Mobile Safari, on the phone:

1. The safe areas in portrait and landscape: header, tab bar, a sheet.
2. No grey flash when tapping.
3. Rows that light up on a tap but not as a scroll starts.
4. Light-mode toolbar tint.

The emulated browser can't reproduce any of those.
