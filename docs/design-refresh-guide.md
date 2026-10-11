# Design refresh: working guide

How the owner and the agent work together on the refresh, what each platform
can do, and where to look for references. Written 2026-10-10, before any
refresh work starts.

## The system already exists

`packages/tokens/src/tokens.ts` holds every raw value (colour, type, spacing,
radius, motion) and generates both the web CSS and the iOS values. Each
platform kit builds from it: `apps/webapp/src/kit` (Base UI) and
`apps/native/src/kit`, and every screen is built from its kit. A refresh
changes tokens, then kit components, then screens, in that order. Most of the
look changes before any screen file is touched.

Review the system itself in the kit galleries: `/_kit` on the web dev server,
and You → Kit in an iOS development build.

## What the agent needs from the owner

1. **A one-page brief.** Fill in the template at the end. Direction matters more
   than detail.
2. **References, with the reason.** Screenshots beat descriptions: "this row
   from Things, because it's calm and the date sits quietly on the right"
   tells the agent far more than "clean". Drop images into chat, onto a
   Paper canvas, or into a folder in the repo. The agent can read images but
   not video, so describe motion in words or name the app and screen.
3. **Reactions to options, not specs.** The agent proposes two or three
   directions for a few key screens; the owner picks, mixes, or says what
   bothers them ("too busy", "the pink feels cheap here"). Circle the
   problem on a screenshot when it's visual.
4. **Standing preferences.** Existing ones: less helper text, confirming
   actions on the right, no system red for neutral badges, motion that's
   quick and calm. New ones go into the brief.

## Tools connected in this workspace

| Tool | Use |
| --- | --- |
| **Mobbin** | The agent can search real app screens and flows directly (iOS and web), e.g. "job list with saved state" or "onboarding with role picker". |
| **Paper** | A design canvas the agent can read from (your selection, screenshots) and write into (HTML artboards). Good for laying out directions side by side before any code. |
| **Simulator and browser** | The agent builds the real app and screenshots it, so a direction is judged in the product, not only in mockups. |
| Figma | Available as a plugin but not connected; connect it if you'd rather work there. |

## What each platform can do

### Desktop and mobile web

Everything is ours to draw. Base UI supplies behaviour and accessibility
(dialogs, popovers, menus, selects, comboboxes, tooltips, tabs, toasts,
switches, sliders); the look is entirely ours. Limits are the browser's:

- **Mobile web:**
  - No hover, so anything revealed on hover needs a tap equivalent.
  - Safari's floating bottom toolbar takes its tint from the page; plan for
    it, and for safe areas.
  - Horizontal swipes near the screen edges belong to Safari's back gesture.
  - No haptics, and only the browser's own share sheet (`navigator.share`).
  - Web push on iPhone only works once the site is added to the Home Screen.
- **Desktop:**
  - Room for density, keyboard shortcuts and the split view (list beside the
    job), which is already built.

The web can carry the most brand: its navigation, tabs and sheets are ours too.

### iOS

Three tiers. The rule of thumb is that the **chrome is Apple's and the content
is ours**.

**1. Native system parts.** The system draws these; they look and behave
exactly like iOS, and styling is mostly limited to tint and some fonts.
- Navigation:
  - Navigation bar with large title, search field and back swipe.
  - The floating Liquid Glass tab bar: icons, labels and badges only.
  - Header buttons with pull-down menus.
- Overlays:
  - Page sheets and form sheets with drag-to-dismiss.
  - Alerts and action sheets, and long-press context menus.
  - The share sheet.
  - The in-app Safari sheet.
- Controls:
  - Segmented controls, switches, date and time pickers.
  - The pull-to-refresh spinner.
  - The keyboard.
  - The Sign in with Apple button.
- System features:
  - SF Symbols.
  - SF Pro text, with Dynamic Type sizes.
  - Haptics and notifications.
- Through `@expo/ui`, many more SwiftUI controls (pickers, sliders, forms,
  menus) can be dropped into screens.

**2. Custom but native-feeling.** Built in React Native, styled any way we
like, and made to feel at home:
- **Content:** the job rows, cards, buttons, fields and toasts; the job page;
  empty states; onboarding.
- **Motion:** spring animations and gestures on the UI thread (Reanimated,
  Gesture Handler), like the new full swipe; blur and gradients.
- **Fonts and images:** custom fonts, including Klim if you buy an app
  licence (usually separate from the web licence), and illustrations.

**3. Hard, costly or not worth it:**
- **Reshaping system parts:**
  - A custom-shaped or patterned tab bar, or arbitrary views inside it.
  - Restyled alerts or keyboards.
  - Web-style hover.
- **Pixel-identical parity with the web:** iOS users expect iOS chrome, and
  fighting it reads as off.
- **Possible but extra native work:** Home Screen widgets and Live
  Activities (a separate native target).

So the brand on iOS lives in type, colour, imagery, layout, motion and voice
inside the content area. On the web it can also shape the navigation.

### Shared versus per platform

- **Shared through tokens:**
  - Colour roles, the type scale and weights, spacing and radius, motion
    timing, voice and copy.
  - The logo, once commissioned.
- **Per platform:**
  - Navigation and chrome; menus versus popovers.
  - Sheet behaviour and density.
- **An open decision for the refresh is icons.** Today it's Phosphor in
  content and SF Symbols in the iOS bars. The options:
  - Keep that split.
  - SF Symbols everywhere on iOS.
  - Phosphor everywhere.

## Research

- **Mobbin:** real flows from shipped apps; search by screen or flow.
- **Apple Human Interface Guidelines:** read the Liquid Glass, tab bar,
  sheet, list and typography pages.
- **Apple Design Resources:** official iOS UI kits for Figma and Sketch, for
  mocking with real system parts.
- **The SF Symbols app:** free for Mac; browse every icon, its weights and its
  variants.
- **WWDC design sessions:** "Meet Liquid Glass" (2025) and the yearly design
  sessions.
- **Web craft:**
  - The `better-*` interface skills already used on this project.
  - Rauno Freiberg's "Invisible Details of Interaction Design".
  - Emil Kowalski's writing on animation.
  - The book *Refactoring UI*.
- **Products to study for feel:**
  - Linear, Things, Arc, Raycast, Apple Mail and Reminders.
  - Klim's own specimen pages, which show the typefaces at their best.

## Proposed process

1. **Brief and references:** the owner, about an hour.
2. **Directions:** the agent makes two or three directions for three screens
   (feed, job page, onboarding) on desktop, mobile web and iOS, laid out in
   Paper. Each direction comes with a short rationale.
3. **Pick and mix:** the owner chooses; one round of changes.
4. **Codify:** tokens and kit first, reviewed in the kit galleries on both
   platforms.
5. **Roll out:** screen by screen, each with screenshots and testing flows,
   deployed on the owner's go-ahead.

## Brief template

```md
## Feeling
Three to five words for how Pinkslip should feel:

## Who it's for and the moment they use it
(e.g. a student checking new grad roles between classes, on their phone)

## Love (screenshots or links, each with one line on why)
1.
2.
3.

## Don't want (and why)
1.

## Keep from today
(the pink? the slips logo idea? the type?)

## Change from today

## Platforms
Which matters most: iOS, mobile web, desktop?

## Constraints
(fonts licensed or not, logo timing, accessibility, launch date)
```
