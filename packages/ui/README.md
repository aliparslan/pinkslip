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
| `src/styles/motion.css` | How things move: the `dur-*` utilities, the named motions (`motion-pop`, `motion-dialog`, `motion-fade`, `motion-collapse`, `motion-mark`, `motion-glide`, `motion-turn`), the parts with their own motion (segmented selection, drawer, toasts), and reduced motion. |
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
| `toggle.tsx` | `Toggle`, `Segmented`, `Segment`, `Toolbar` | A pressed toggle is recessed with a pink label. `Segmented` measures the pressed segment and glides a raised selection to it. |
| `field.tsx` | `Field`, `TextField`, `Input`, `SearchInput`, `Fieldset`, `Form` | Label above, one recessed box for every kind of entry. Focus rings it pink; invalid rings it red. A passed `error` marks the field invalid. |
| `choice.tsx` | `Checkbox`, `CheckboxGroup`, `Radio`, `RadioGroup`, `ChoiceLabel`, `Switch` | Checked is always a pink fill. The switch thumb stretches while pressed and glides on release. |
| `range.tsx` | `Slider`, `NumberField`, `Meter`, `Progress` | Filled tracks are lit from below. |
| `otp-field.tsx` | `OTPField` | The six-digit sign-in code. |
| `select.tsx` | `Select` | Field-styled trigger, glass list. |
| `combobox.tsx` | `Combobox`, `Autocomplete` | Multiple selection shows pink chips inside the field. |
| `overlay.tsx` | `Dialog`, `AlertDialog`, `Drawer`, `DrawerHandle`, `DialogActions` | The drawer follows the finger and settles on the sheet curve. |
| `floating.tsx` | `Popover`, `Tooltip`, `PreviewCard` | All grow from their trigger (`motion-pop`). |
| `menu.tsx` | `Menu`, `ContextMenu`, `Menubar`, `MenubarTrigger`, `menuItemDanger` | Highlight fills with the accent. |
| `navigation-menu.tsx` | `NavigationMenu` | Public site only; the app uses tabs. |
| `disclosure.tsx` | `Accordion`, `Collapsible`, `Tabs` | Panels collapse by height; the tab rule glides. |
| `display.tsx` | `Avatar`, `Separator`, `ScrollArea` | Company marks are squared off. |
| `toast.tsx` | `ToastProvider`, `Toaster`, `useToastManager` | Stacked, opaque, swipe to dismiss. `data.leading` takes a company mark. |
| `icons.tsx` | Control icons | Affordances only (check, chevrons, close, search, bookmark, share, more, bell, sliders). Product icons wait for an icon family. |

Shared class strings live in `src/lib/surface.ts` (glass surface, menu items)
and helpers in `src/lib/cn.ts` (`cn`, `styled`, `mergeClassName`).

## Quarantine

New since the last review in the playground, pending approval:

- Fields put the label above a recessed box (the form-box "slip" field is
  gone).
- The motion system: named motions, exits shorter than entrances, springs for
  things that glide, instant keyboard opens, and reduced motion that keeps
  fades but drops movement.
- Switch thumb stretch on press; the search card's summary and question
  cross-fade.
- The playground's View panel: theme, motion speed (down to a tenth), and a
  reduced-motion preview.

## iOS

The planned Expo app will not use this package. It will read the same token
values and draw native controls with them, so the two apps share decisions,
not code.
