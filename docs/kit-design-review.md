# Kit design review (2026-10-09)

An objective pass over the web kit as ported in 2.1–2.3, judged against itself
and the token rules rather than against the Svelte app it copies. Most issues
are inherited: the port reproduced them faithfully. Each finding is marked
**fixed** (a minor tweak made in this pass), **decide** (small, but a
product call), or **redesign** (bigger, left for the planned design refresh).

## Fixed in this pass

1. **Two "primary" buttons.** The ink-filled `primary` was the kit default,
   but the current app uses it once (Tailor, which is tabled) against 30+ pink
   `btn-accent` buttons. Pink is now `primary` and the default; the ink
   variant is gone. Variants: `primary`, `secondary`, `danger`.
2. **Selected chips change width.** Active chips switched from weight 500 to
   600, so the label widened and the row reflowed on every tap. They stay at
   500; the soft pink fill and border already mark the selection. (This also
   follows the weight rule: 600 is for display type.)
3. **Four disabled opacities.** 0.5 (switch, checkbox, toggle, icon button),
   0.55 (menu item) and 0.6 (button, input). All disabled controls now use 0.6,
   the value the button chose for legibility.
4. **One focus ring that wasn't.** Every control uses a 2px accent outline
   with a 2px offset, except the switch, which drew a 45% accent box-shadow.
   The switch now uses the same outline.
5. **Two segmented switchers, opposite in dark mode.** `Tabs` is a sunken
   track with a raised `bg-elev` pill. `ToggleGroup variant="segmented"` had
   no track and a `control-active-bg` pill, which in dark mode is *darker*
   than the page, so the same idea read as raised in one place and sunken in
   the other. The segmented variant now uses the Tabs track and pill.
6. **Confirmation text at 13px.** Dialog subtitles were `fs-xs`, below the
   14px field labels. In an AlertDialog that subtitle *is* the message
   ("Your account will be permanently deleted…"). Subtitles are now `fs-sm`.
7. **Mixed icon weights on the same control.** `IconButton` draws bold icons,
   but the dialog, sheet and toast close buttons, which share its look, drew
   regular ones. All close buttons are bold now.
8. **Floating surfaces disagreed.** Menus used `radius-md` and the toast
   shadow; the new popover used `radius-lg` and the overlay shadow. The popover
   now matches the menu, since they're the same family of anchored surfaces.
9. **Dialog border lighter than every other surface.** Cards, lists, menus
   and popovers use `line-2`; the dialog card and sheet used `line`. They use
   `line-2` now.
10. **`warn` versus `warning`.** `Alert` said `warn` and `toast` said
    `warning`. Both say `warning`.

## Fixed in the second pass (owner decisions)

11. **Pink at every width.** The switch and checkbox no longer turn grey below
    900px, and the switch's `tone="accent"` escape hatch is gone.
12. **The sheet is raised** (`bg-elev`, like dialogs) instead of sitting on the
    page background.
13. **Field errors are one line of red text** under the control, linked by
    `aria-describedby`. `Alert` is for form-level messages.
14. **Spacing is on the 4px grid.** Every padding, margin, gap and offset in
    the kit uses the space tokens (4, 8, 12, 16, 20, 40). The old 5, 6, 7, 10,
    13, 14 and 18px values are gone; the card and sheet gutters are 20px.
    Popup offsets are all 8px. What remains in raw pixels are component
    dimensions, not spacing: the 44×26 switch, 20px checkbox, 36×4 grabber,
    hairlines and the 24px badge and 20px count pill (both moved onto the
    grid).
15. **Three control heights, and rows line up.** 48px (`control-height`):
    buttons, inputs, selects, default icon buttons, tabs. 40px
    (`control-height-compact`, 44 on phones): compact buttons, small icon
    buttons, segmented controls, menu items. 32px (`control-height-small`,
    44 on phones): toast buttons. Chips stay 32px at every width. Icon
    buttons moved from 44 to 48 so they sit level with buttons.
16. **Radius scale without duplicates or width jumps.** `radius-xs` 6,
    `radius-sm` 8, `radius-md` 10, `radius-lg` 14, `radius-xl` 20 at every
    width (tokens changed; listed in `intentionalDivergences` so the
    equivalence check still guards everything else). Inner pills and menu
    items use `radius-xs`, concentric with their `radius-md` container and
    its 4px inset.
17. **One rule for selection.** Choosing a *value* is pink: checkbox, switch,
    selected chip (soft pink), pressed icon button, menu check. Choosing a
    *view* is a raised neutral pill: `Tabs` and the segmented `ToggleGroup`.
    Grey "selected" fills are gone.
18. **Filled buttons have no outline.** The pink button's border was the
    accent mixed 74% with ink: a pale ring in dark mode and a darker one in
    light mode, which is the off color that showed when zoomed in. Filled
    buttons are borderless (a transparent 1px keeps every variant the same
    size). Secondary and danger keep the neutral `line-2` outline so they
    still read on raised surfaces like dialogs. This matches common practice
    (Linear, shadcn, Apple): fills carry no stroke, outlines are neutral.

19. **Rose instead of magenta, with white text on fills.** The dark-mode pink
    button had near-black text, the one dark-on-color label in a mode where
    every other label is light. White on that pastel pink is 2.2:1, so the
    pink itself moved. The accent is now rose (hue 5 instead of 350), split
    in two: `accent-fill` (`oklch(0.584 0.17 5)`, #c9456e) for buttons,
    switches, checkboxes, progress and the brand mark, identical in both
    modes with white `accent-ink` (4.6:1); and `accent` for pink text, icons,
    borders and focus rings, light rose in dark mode (9.6:1 on the page) and
    a deeper rose in light mode (4.9:1). Hue 5 is as warm as it can go before
    it reads as the error red (hue 25). Native gets the same values.

## Still open

- The switch track is 44×26 (iOS-like but off the grid; the iOS switch is
  51×31). Left as is.
- `--ease-standard` still changes below 900px (inherited). Harmless, but the
  same motion should probably feel the same at every width.
- The tooltip is inverted (ink background) while every other floating
  surface is `bg-elev`. Intentional, so it reads as a label.
