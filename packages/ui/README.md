# @pinkslip/ui

Pinkslip's web design system for the React stack: tokens, one skin, one
motion system, and every Base UI component styled once. Apps compose these
parts; they do not restyle them.

Status: in review in the component playground (`apps/web-react`). Nothing
here ships in the production app yet.

## Where decisions live

| File | Owns |
| --- | --- |
| `src/styles/theme.css` | Every token: color (light and dark), type scale, radii, control height, durations, easings. Tailwind's defaults are wiped, so a class that is not backed by a token here does not exist. |
| `src/styles/skin.css` | Paint for each component (`ps-*` classes): fills, borders, gradients, shadows, highlights. The style is tactile: raised controls, recessed fields and tracks, glass menus. |
| `src/styles/motion.css` | How things move: the `dur-*` utilities, the named motions (`motion-pop`, `motion-dialog`, `motion-fade`, `motion-collapse`, `motion-mark`, `motion-glide`, `motion-turn`, `motion-dismiss`), the parts with their own motion (segmented selection, drawer, toasts, spinner, skeleton), and reduced motion. |
| `src/styles/base.css` | Page canvas, headings, selection, focus outline. |
| `src/*.tsx` | Components. Layout in utilities, paint from a `ps-*` class, motion from a `motion-*` class. |

Rules, enforced by `bun run check:frontend`:

- Colors appear only in `theme.css` (and as relative colors in `skin.css`).
- Durations are `--dur-*` tokens or `dur-*` / `motion-*` classes, never a
  number of milliseconds or a Tailwind `duration-*`.
- Arbitrary values are for layout only (widths, grid tracks, viewport math),
  never for color, type, radius, shadow, or motion.
- A utility never paints a skinned element; change `skin.css` instead.
- `@theme` appears only in `theme.css`.
- This package imports only React, Base UI, and `clsx`. No API, router,
  store, or domain code.
- Apps import components from here, not from `@base-ui/react` directly. The
  playground is the one exception, for demos.
- Every component module is listed below.

## Components

| Module | Exports | Notes |
| --- | --- | --- |
| `button.tsx` | `Button`, `buttonClass` | Variants: primary (pink gradient), secondary (raised), ghost, danger (secondary with red text, so red never competes with pink). Sizes sm, md, lg, icon, icon-sm. |
| `toggle.tsx` | `Toggle`, `Chip`, `chipClass`, `Segmented`, `Segment`, `Toolbar` | A pressed toggle is recessed with a pink label; sizes md, lg, icon, icon-sm. `raised` paints it like the secondary button, for a toggle in a row of buttons (Save in the job page's bar). `Chip` is the pill used for filters and choices. `Segmented` measures the pressed segment and slides a raised selection to it. |
| `field.tsx` | `Field`, `TextField`, `Input`, `SearchInput`, `Fieldset`, `Form` | Label above, one recessed box for every kind of entry. Focus rings it pink; invalid rings it red. A passed `error` marks the field invalid. `Input` and `SearchInput` come in md and lg. |
| `choice.tsx` | `Checkbox`, `CheckboxGroup`, `Radio`, `RadioGroup`, `ChoiceLabel`, `Switch` | Checked is always a pink fill. The switch thumb stretches while pressed and glides on release. |
| `range.tsx` | `Slider`, `NumberField`, `Meter`, `Progress` | Filled tracks are flat pink, recessed. |
| `otp-field.tsx` | `OTPField` | The six-digit sign-in code. |
| `select.tsx` | `Select` | Field-styled trigger, glass list. |
| `combobox.tsx` | `Combobox`, `Autocomplete` | Multiple selection shows pink chips inside the field. |
| `overlay.tsx` | `Dialog`, `AlertDialog`, `Drawer`, `DrawerHandle`, `DialogActions` | The drawer follows the finger and settles on the sheet curve. |
| `floating.tsx` | `Popover`, `Tooltip`, `PreviewCard` | All grow from their trigger (`motion-pop`). |
| `menu.tsx` | `Menu`, `ContextMenu`, `Menubar`, `MenubarTrigger`, `menuItemDanger` | Highlight fills with the accent. |
| `navigation-menu.tsx` | `NavigationMenu` | Public site only; the app uses tabs. |
| `disclosure.tsx` | `Accordion`, `Collapsible`, `Tabs` | Panels collapse by height; the tab rule glides. |
| `display.tsx` | `Avatar`, `Badge`, `Separator`, `ScrollArea` | Avatar sizes sm (24), md (40), lg (56); company marks are squared off. Badge tones: neutral, accent, good, warn, bad. |
| `loading.tsx` | `Spinner`, `Skeleton` | The spinner turns in eight steps like the system one; under reduced motion it breathes instead. Skeletons shimmer, and hold still under reduced motion. |
| `toast.tsx` | `ToastProvider`, `Toaster`, `useToastManager` | Stacked, opaque, swipe to dismiss. `data.leading` takes a company mark. |
| `icons.tsx` | Control icons | Affordances only (check, chevrons, close, search, bookmark, share, more, bell, sliders). Product icons wait for an icon family. |

Shared class strings live in `src/lib/surface.ts` (glass surface, menu items)
and helpers in `src/lib/cn.ts` (`cn`, `styled`, `mergeClassName`); apps can
import them from `@pinkslip/ui/lib/*`.

List rows that open something (a job, a company, a setting) take their paint
from `.ps-row` in `skin.css`: the row's main link carries `.ps-row-link` and
stretches over the row, hover tints it, pressing fills it, `data-selected`
keeps it filled, and focus rings the whole row.

## Quarantine

New since the last review in the playground, pending approval:

- Fields put the label above a recessed box (the form-box "slip" field is
  gone).
- The motion system: named motions, exits shorter than entrances, ease-in-out for
  things that glide, instant keyboard opens, and reduced motion that keeps
  fades but drops movement.
- Switch thumb stretch on press; the search card's summary and question
  cross-fade.
- The playground's View panel: theme, motion speed (down to a tenth), and a
  reduced-motion preview.
- Parts, first batch: `Badge`, `Spinner`, `Skeleton`, Avatar sizes, `Toggle`
  sizes, the `.ps-row` list row, and `motion-dismiss` for rows leaving a list
  (job rows, companies, saved jobs, admin queues). In the app:
  `CompanyMark`, `JobRow`, `JobRowSkeleton`, `JobList`
  (`apps/web-react/src/components`).
- The two-line job row (approved layout: title over company, place, and pay;
  age and saved status on the right; the new dot on the logo), with hover
  actions and a right-click or long-press menu.
- Gradient edges on raised controls; type size following control height
  (28/13, 36/14, 44/16); `Chip`; large inputs; `--surface` so rows match the
  surface under them; ease-in-out instead of springs.
- The Jobs header (option B) in the playground: no title, a large search
  field, and the chips Location, Pay, and New.
- `.ps-prose` in `base.css` for long-form text such as job postings, and
  the back and alert icons.
- The job page in the playground: a slim company row with when it was
  posted, the exact title full width below, fit as a quiet line of what the
  header doesn't already say, places and pay that open in a sheet when there
  are many, and a bar of Save (which becomes the Track status) and Apply, or
  Auto apply for subscribers. For
  them: `Toggle` size `lg` and `raised`; `.ps-facts` in `base.css`, a dotted
  line of facts that wraps without stray dots; and in core,
  `jobLocationParts` and `jobPayBands`, which split a posting's places and
  pay bands.

## iOS

The planned Expo app will not use this package. It will read the same token
values and draw native controls with them, so the two apps share decisions,
not code.
