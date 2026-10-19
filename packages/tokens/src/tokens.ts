/**
 * Pinkslip design tokens: the single source of truth for the generated web
 * stylesheet (`tokens.css`), the native values (`native.ts`) and the kit prop
 * unions (`types.ts`).
 *
 * `bun run generate` writes those files; `bun run check` fails when they drift.
 * Values mirror the frozen Svelte design, and `check-equivalence.ts` compares
 * every resolved value against that frozen copy until chunk 3.4 deletes the
 * old app. Deliberate changes are listed in `intentionalDivergences`.
 *
 * Modes are expressed the way the browser cascades them: `dark` is the base
 * semantic set, `light` overrides it, and the `prefers-contrast` media query
 * reuses the attribute-driven contrast values because WKWebView does not
 * reliably expose iOS Increase Contrast through media queries.
 */

/**
 * Tokens that deliberately differ from the frozen Svelte design, with why.
 * The equivalence check skips these names. See docs/kit-design-review.md.
 */
export const intentionalDivergences: Record<string, string> = {
  "--radius-sm": "8px at every width; Svelte used 6px on desktop (a duplicate of radius-xs) and 8px on phones",
  "--radius-xl": "20px at every width; Svelte jumped from 14px to 20px below 900px",
  "--color-accent-fill": "new: filled controls use the pastel pink in both modes with dark text (9.1:1)",
  "--color-accent-ink": "dark text on the pastel fill in both modes; Svelte used white on a deep magenta in light mode",
  "--color-logo-tile": "new: company logos sit on white in both modes; Svelte put them on the sunken surface, near-black in dark mode",
  "--ease-out": "new: a strong ease-out for presses and things that enter (Emil Kowalski's curve); the iOS kit's Reanimated motion reads it",
};

/** Breakpoints are emitted as media queries, never as custom properties. */
export const breakpoints = {
  wide: 900,
} as const;

/**
 * The `color-scheme` declaration picks native form-control and scrollbar
 * rendering per mode. It is a plain declaration, not a custom property, so the
 * native values file omits it.
 */
export const colorScheme = {
  dark: "dark",
  light: "light",
} as const;

/**
 * Scalars and layout shared by every mode, emitted into the base `:root`.
 * Rem-based type roles let native iOS follow its content-size category while
 * keeping the exact existing scale at the default 16px root.
 */
export const base = {
  // Environment and layout
  "--safe-top": "env(safe-area-inset-top, 0)",
  "--safe-bottom": "env(safe-area-inset-bottom, 0)",
  "--app-mobile-width": "480px",
  "--app-reading-width": "720px",
  "--app-nav-wide": "232px",
  "--screen-gutter": "16px",
  "--screen-nav-height": "56px",
  "--mobile-tab-bar-height": "58px",
  "--root-header-height": "calc(var(--safe-top) + 90.5px)",
  "--tap-min": "44px",
  "--control-height": "48px",
  "--control-height-compact": "40px",
  "--control-height-small": "32px",
  "--pill-height": "32px",

  // Type
  "--fs-3xs": "0.6875rem",
  "--fs-2xs": "0.75rem",
  "--fs-xs": "0.8125rem",
  "--fs-sm": "0.875rem",
  "--fs-md": "1rem",
  "--fs-base": "1rem",
  "--fs-lg": "1.125rem",
  "--fs-xl": "min(1.375rem, 32px)",
  "--fs-2xl": "min(1.5rem, 36px)",
  "--fs-4xl": "min(2rem, 48px)",
  "--fs-root-title": "min(2.5rem, 56px)",
  "--font-heading": '"Pinkslip Founders Grotesk", "Helvetica Neue", Helvetica, Arial, sans-serif',
  "--font-display": '"Pinkslip Untitled Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
  "--font-sans": '"Pinkslip Untitled Sans", "Helvetica Neue", Helvetica, Arial, sans-serif',
  "--font-mono": 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace',
  "--leading-body": "1.46",
  "--leading-root-title": "1.12",
  "--leading-screen-title": "1.14",
  "--tracking-root-title": "-0.012em",
  "--tracking-screen-title": "-0.01em",

  // 4px rhythm. Compatibility aliases remain while legacy screens migrate.
  "--space-1": "4px",
  "--space-2": "8px",
  "--space-3": "12px",
  "--space-4": "16px",
  "--space-5": "20px",
  "--space-6": "24px",
  "--space-8": "32px",
  "--space-10": "40px",

  // Motion
  "--duration-instant": "140ms",
  "--duration-fast": "180ms",
  "--duration-standard": "220ms",
  "--ease-standard": "cubic-bezier(0.2, 0.7, 0.2, 1)",
  "--ease-out": "cubic-bezier(0.23, 1, 0.32, 1)",

  // Layering
  "--z-navigation": "20",
  "--z-overlay": "40",
  "--z-toast": "60",
  "--overlay-bottom-offset":
    "calc(var(--mobile-tab-bar-height) + var(--safe-bottom) + var(--space-3))",
} as const;

/** Dark is the default mode and also carries the mode-independent radii. */
export const dark = {
  "--radius-xs": "6px",
  "--radius-sm": "8px",
  "--radius-md": "10px",
  "--radius-lg": "14px",
  "--radius-xl": "20px",
  "--radius-full": "999px",

  // Near-neutral graphite. Chroma stays deliberately below 0.008.
  "--color-bg": "oklch(0.165 0.005 285)",
  "--color-bg-elev": "oklch(0.205 0.006 285)",
  "--color-bg-sunken": "oklch(0.135 0.004 285)",
  "--color-ink": "oklch(0.965 0.003 285)",
  "--color-ink-2": "oklch(0.82 0.005 285)",
  "--color-ink-3": "oklch(0.68 0.006 285)",
  "--color-ink-4": "oklch(0.62 0.006 285)",
  "--color-line": "oklch(0.29 0.006 285)",
  "--color-line-2": "oklch(0.36 0.007 285)",
  "--color-message-border": "oklch(1 0 0 / 0.13)",
  // Printed document canvas; intentionally remains paper-white in every app theme.
  "--color-paper": "oklch(1 0 0)",

  // Pink is identity and state, never the ambient canvas.
  // Lightened from 0.72 so the dark label on a filled pink button clears APCA 60
  // (was Lc 51.8, now 61.8). Chroma follows the sRGB ceiling down as L rises.
  // `accent` is for pink text, icons, borders and focus rings. `accent-fill`
  // is for filled controls: the pastel pink in both modes, always with dark
  // `accent-ink` on top (9.1:1).
  "--color-accent": "oklch(0.78 0.153 350)",
  "--color-accent-fill": "oklch(0.78 0.153 350)",
  "--color-accent-ink": "oklch(0.16 0.01 350)",
  // Company logos are drawn for light backgrounds, so they sit on white in
  // every mode (CompanyLogo).
  "--color-logo-tile": "oklch(1 0 0)",
  "--color-accent-soft": "oklch(0.255 0.055 350)",
  "--color-accent-soft-ink": "oklch(0.86 0.089 350)",
  "--color-selection-bg": "oklch(0.91 0.004 285)",
  "--color-selection-ink": "oklch(0.18 0.006 285)",

  "--color-good": "oklch(0.73 0.14 150)",
  "--color-good-soft": "oklch(0.235 0.035 150)",
  "--color-warn": "oklch(0.79 0.14 75)",
  "--color-bad": "oklch(0.72 0.17 25)",
  "--color-bad-soft": "oklch(0.245 0.045 25)",

  "--color-control-bg": "oklch(0.255 0.006 285)",
  "--color-input-bg": "var(--color-control-bg)",
  "--color-control-border": "oklch(0.37 0.007 285)",
  "--color-control-active-bg": "oklch(0.145 0.004 285)",
  "--color-control-active-ink": "oklch(0.98 0.002 285)",
  "--color-control-selected-bg": "oklch(0.37 0.007 285)",
  "--color-control-selected-ink": "oklch(0.98 0.002 285)",
  "--color-control-selected-border": "oklch(0.5 0.007 285)",
  "--color-scrim": "oklch(0 0 0 / 0.52)",
  // Image edges only. Must stay pure white/black with alpha — a tinted neutral
  // picks up whatever surface sits behind it and reads as dirt on the edge.
  "--color-image-outline": "oklch(1 0 0 / 0.1)",
  // Opaque base for the nav transition dim; App.svelte animates its opacity.
  "--color-nav-dim": "oklch(0 0 0)",

  "--shadow-control-active": "0 1px 4px oklch(0 0 0 / 0.3)",
  "--shadow-overlay": "0 18px 54px oklch(0 0 0 / 0.32)",
  "--shadow-overlay-lg": "0 24px 80px oklch(0 0 0 / 0.36)",
  "--shadow-toast": "0 12px 36px oklch(0 0 0 / 0.25)",
  "--shadow-sheet": "0 -8px 32px oklch(0 0 0 / 0.3)",
} as const;

/** Light mode overrides. Anything absent inherits the dark set above. */
export const light = {
  // Near-neutral stone rather than the previous pink wash.
  "--color-bg": "oklch(0.985 0.002 80)",
  "--color-bg-elev": "oklch(1 0 0)",
  "--color-bg-sunken": "oklch(0.962 0.003 80)",
  "--color-ink": "oklch(0.18 0.006 285)",
  "--color-ink-2": "oklch(0.34 0.006 285)",
  "--color-ink-3": "oklch(0.46 0.006 285)",
  "--color-ink-4": "oklch(0.52 0.006 285)",
  "--color-line": "oklch(0.905 0.003 80)",
  "--color-line-2": "oklch(0.825 0.004 80)",
  "--color-message-border": "oklch(0 0 0 / 0.14)",

  "--color-accent": "oklch(0.57 0.205 350)",
  "--color-accent-soft": "oklch(0.965 0.018 350)",
  "--color-accent-soft-ink": "oklch(0.4 0.15 350)",
  "--color-selection-bg": "oklch(0.22 0.006 285)",
  "--color-selection-ink": "oklch(0.99 0.002 80)",

  // good, warn and bad-soft are at their sRGB chroma ceilings for these L/H
  // pairs — the previous 0.14 / 0.14 / 0.03 read as more saturated than sRGB
  // can show, so they rendered identically to these values anyway.
  "--color-good": "oklch(0.48 0.132 150)",
  "--color-good-soft": "oklch(0.955 0.025 150)",
  "--color-warn": "oklch(0.53 0.111 75)",
  "--color-bad": "oklch(0.5 0.18 25)",
  "--color-bad-soft": "oklch(0.955 0.022 25)",

  "--color-control-bg": "oklch(0.94 0.002 80)",
  "--color-control-border": "oklch(0.835 0.004 80)",
  "--color-control-active-bg": "oklch(1 0 0)",
  "--color-control-active-ink": "oklch(0.18 0.006 285)",
  "--color-control-selected-bg": "oklch(0.255 0.006 285)",
  "--color-control-selected-ink": "oklch(0.99 0.002 80)",
  "--color-control-selected-border": "oklch(0.255 0.006 285)",
  "--color-scrim": "oklch(0.12 0.006 285 / 0.38)",
  "--color-nav-dim": "oklch(0.12 0.006 285)",
  "--color-image-outline": "oklch(0 0 0 / 0.1)",

  "--shadow-control-active": "0 1px 4px oklch(0 0 0 / 0.1)",
  "--shadow-overlay": "0 20px 60px oklch(0.16 0.01 285 / 0.16)",
  "--shadow-overlay-lg": "0 24px 80px oklch(0.16 0.01 285 / 0.18)",
  "--shadow-toast": "0 12px 34px oklch(0.16 0.01 285 / 0.14)",
  "--shadow-sheet": "0 -8px 32px oklch(0.16 0.01 285 / 0.14)",
} as const;

/**
 * Increased contrast on dark. The `[data-ios-contrast="more"]` attribute and
 * the `prefers-contrast: more` media query intentionally share these values.
 */
export const contrast = {
  "--color-ink-2": "oklch(0.88 0.005 285)",
  "--color-ink-3": "oklch(0.76 0.006 285)",
  "--color-ink-4": "oklch(0.7 0.006 285)",
  "--color-line": "oklch(0.38 0.006 285)",
  "--color-line-2": "oklch(0.48 0.007 285)",
  "--color-control-border": "oklch(0.5 0.007 285)",
} as const;

/** Increased contrast on light, applied after `light` overrides. */
export const contrastLight = {
  "--color-ink-2": "oklch(0.25 0.006 285)",
  "--color-ink-3": "oklch(0.4 0.006 285)",
  "--color-ink-4": "oklch(0.46 0.006 285)",
  "--color-line": "oklch(0.82 0.003 80)",
  "--color-line-2": "oklch(0.72 0.004 80)",
  "--color-control-border": "oklch(0.72 0.004 80)",
} as const;

/** Wide-layout override, emitted inside `@media (min-width: 900px)`. */
export const wide = {
  "--root-header-height": "calc(var(--safe-top) + 136.5px)",
} as const;

/** Reduced-motion override, emitted inside `prefers-reduced-motion`. */
export const reducedMotion = {
  "--duration-instant": "1ms",
  "--duration-fast": "1ms",
  "--duration-standard": "1ms",
} as const;

/**
 * Token groups drive the web prefixes, the generated native object shape and
 * the kit prop unions. `modes: true` marks groups whose values differ between
 * dark, light and the increased-contrast variants.
 */
export const groups = {
  color: { prefix: "--color-", modes: true },
  shadow: { prefix: "--shadow-", modes: true },
  radius: { prefix: "--radius-" },
  space: { prefix: "--space-" },
  fontSize: { prefix: "--fs-" },
  duration: { prefix: "--duration-" },
  ease: { prefix: "--ease-" },
  zIndex: { prefix: "--z-" },
  fontFamily: { prefix: "--font-" },
  leading: { prefix: "--leading-" },
  tracking: { prefix: "--tracking-" },
} as const;

/** Groups without a shared prefix, listed for the native values file. */
export const singleGroups = {
  environment: ["--safe-top", "--safe-bottom"],
  layout: [
    "--app-mobile-width",
    "--app-reading-width",
    "--app-nav-wide",
    "--screen-gutter",
    "--screen-nav-height",
    "--mobile-tab-bar-height",
    "--root-header-height",
    "--overlay-bottom-offset",
  ],
  sizing: [
    "--tap-min",
    "--control-height",
    "--control-height-compact",
    "--control-height-small",
    "--pill-height",
  ],
} as const;

export type CssTokenName = keyof typeof base | keyof typeof dark;

// ---------------------------------------------------------------------------
// The October 2026 redesign (Take A in docs/redesign-wireframes.md)

/**
 * The redesign's palette, iOS first. The generator emits it as `ui` in
 * `native.ts` and never into `tokens.css`, so the live web keeps the port
 * design until it gets its own redesign. Native screens move to it one at a
 * time through `apps/native/src/ui`; when the last one has moved, the port
 * palette above retires on iOS. Modes cascade like the port set: `uiLight`,
 * `uiContrast` and `uiContrastLight` override `uiDark`.
 *
 * `ink-4` is for strokes and disabled marks only, never text. Shadows are
 * warm in light and black in dark, so a raised card never glows on graphite.
 */
export const uiDark = {
  "--ui-bg": "oklch(0.165 0.005 285)",
  "--ui-bg-grouped": "oklch(0.215 0.006 285)",
  "--ui-screen-grouped": "oklch(0.125 0.004 285)",
  "--ui-bg-elev": "oklch(0.205 0.006 285)",
  "--ui-ink": "oklch(0.965 0.003 285)",
  "--ui-ink-2": "oklch(0.82 0.005 285)",
  "--ui-ink-3": "oklch(0.68 0.006 285)",
  "--ui-ink-4": "oklch(0.5 0.006 285)",
  "--ui-separator": "oklch(0.29 0.006 285)",
  "--ui-fill": "oklch(0.26 0.006 285)",
  // Pink is for "do this" and "needs you" only. Filled pink is `accent-fill`
  // (#EE5FAC) with white `accent-ink` on top (owner, 2026-10-12; 3.06:1,
  // enough for bold and large text). `accent` is pink text, outlines and
  // dots: the fill pink on dark, a deeper pink on light so text passes 4.5:1.
  "--ui-accent": "oklch(0.69 0.193 350)",
  "--ui-accent-fill": "oklch(0.69 0.193 350)",
  "--ui-accent-ink": "oklch(1 0 0)",
  "--ui-accent-soft": "oklch(0.3 0.07 350)",
  "--ui-good": "oklch(0.73 0.14 150)",
  // Stage marks take color only where something's happening (owner,
  // 2026-10-14): Assessment amber, Interviewing blue, Offer `good`. Marks
  // only, never text or fills.
  "--ui-stage-assessment": "oklch(0.78 0.14 70)",
  "--ui-stage-interview": "oklch(0.7 0.13 250)",
  "--ui-bad": "oklch(0.72 0.17 25)",
  // Settings rows lead with a soft tile colored by what the row is for
  // (owner, 2026-10-14, Paper "You · Oct 14" B4): blue finds jobs, green is
  // what you apply with, pink is Pro, gray is the app. Faint, a step off the
  // card, never text. Dark is D2 ("Dark tiles · options"): quieter tiles
  // and icons, after the first ones read too bright.
  "--ui-tile-find": "oklch(0.245 0.02 260)",
  "--ui-tile-find-ink": "oklch(0.6 0.08 259)",
  "--ui-tile-apply": "oklch(0.245 0.018 155)",
  "--ui-tile-apply-ink": "oklch(0.6 0.07 153)",
  "--ui-tile-pro": "oklch(0.25 0.025 350)",
  "--ui-tile-pro-ink": "oklch(0.58 0.13 350)",
  "--ui-tile-app": "oklch(0.245 0.003 285)",
  "--ui-tile-app-ink": "oklch(0.58 0.006 285)",
  // A meaning's icon standing on the page with no tile (onboarding's page
  // two): brighter than the tile inks, which were quieted to sit on a tile
  // (owner, 2026-10-19, Paper "Page two icons and filled chips" B).
  "--ui-glyph-find": "oklch(0.74 0.12 259)",
  "--ui-glyph-apply": "oklch(0.75 0.12 153)",
  "--ui-glyph-pro": "oklch(0.72 0.17 350)",
  "--ui-pill": "oklch(1 0 0 / 0.12)",
  "--ui-seg-on": "oklch(0.38 0.006 285)",
  // An outlined pill's line (owner, 2026-10-15): pills are clear with this
  // ring, so they read the same on the page, on cards and in sheets.
  "--ui-outline": "oklch(1 0 0 / 0.18)",
  // The ticket and the application stub keep their own paper.
  "--ui-paper": "oklch(0.215 0.006 285)",
  // A sheet and what's grouped in it (owner, 2026-10-15, Sheets A): the
  // group is lighter than the sheet, as a card is lighter than the page.
  "--ui-sheet": "oklch(0.205 0.006 285)",
  "--ui-sheet-group": "oklch(0.26 0.006 285)",
  "--ui-scrim": "oklch(0 0 0 / 0.55)",
  // Company logos are drawn for white, so the tile stays white in both modes;
  // the outline keeps a dark logo's edge on graphite.
  "--ui-logo-tile": "oklch(1 0 0)",
  "--ui-image-outline": "oklch(1 0 0 / 0.14)",
  // Paper in dark keeps light mode's dark grain and stands on a 1pt
  // separator edge instead of a black drop shadow (owner, 2026-10-15, Paper
  // "Dark mode · Oct 15": the light grain looked like TV static).
  "--ui-grain": "oklch(0.36 0.04 60 / 0.26)",
  "--ui-shadow-card": "0px 0px 0px 1px oklch(0.29 0.006 285)",
  // A punched hole shows the page behind the card, shaded under its top edge
  // (owner, 2026-10-12, after trying see-through and black holes).
  "--ui-shadow-hole": "inset 0px 2px 2.5px oklch(0 0 0 / 0.6)",
  // The floating tab bar: a hairline ring so the pill holds its edge on graphite.
  "--ui-shadow-pill": "0px 0px 0px 0.5px oklch(1 0 0 / 0.12), 0px 12px 28px -6px oklch(0 0 0 / 0.7)",
} as const;

export const uiLight = {
  // One page color everywhere, Mist (owner, 2026-10-15, after trying White,
  // Snow, Cloud, Apple gray and Paper on the phone;
  // docs/surfaces-research-2026-10-15.md). Rows sit on it; white is for what
  // is grouped or floats: settings cards, sheets, the tab bar, toasts.
  "--ui-bg": "oklch(0.979 0.001 285)",
  "--ui-bg-grouped": "oklch(1 0 0)",
  "--ui-screen-grouped": "oklch(0.979 0.001 285)",
  "--ui-bg-elev": "oklch(1 0 0)",
  "--ui-ink": "oklch(0.18 0.006 285)",
  "--ui-ink-2": "oklch(0.4 0.006 285)",
  // 0.51, not 0.53, so captions clear 4.5:1 on the gray fill, the pink tint
  // and paper too (owner, 2026-10-15; docs/design-audit-2026-10-15.md).
  "--ui-ink-3": "oklch(0.51 0.006 285)",
  "--ui-ink-4": "oklch(0.78 0.004 285)",
  "--ui-separator": "oklch(0.18 0.006 285 / 0.1)",
  // See-through, as Apple's fills are, so a field or round button reads on
  // the Mist page and on a white card or sheet alike.
  "--ui-fill": "oklch(0.18 0.006 285 / 0.055)",
  "--ui-accent": "oklch(0.57 0.205 350)",
  "--ui-accent-soft": "oklch(0.935 0.038 350)",
  "--ui-good": "oklch(0.48 0.132 150)",
  // 0.65 so the amber mark clears 3:1 on white (owner, 2026-10-15).
  "--ui-stage-assessment": "oklch(0.65 0.145 64)",
  "--ui-stage-interview": "oklch(0.58 0.14 250)",
  "--ui-bad": "oklch(0.5 0.18 25)",
  "--ui-tile-find": "oklch(0.979 0.009 265)",
  "--ui-tile-find-ink": "oklch(0.56 0.141 259)",
  "--ui-tile-apply": "oklch(0.976 0.008 157)",
  "--ui-tile-apply-ink": "oklch(0.57 0.111 153)",
  "--ui-tile-pro": "oklch(0.976 0.012 351)",
  "--ui-tile-pro-ink": "oklch(0.57 0.205 350)",
  "--ui-tile-app": "oklch(0.985 0 0)",
  "--ui-tile-app-ink": "oklch(0.51 0.006 285)",
  // A step deeper than the tile inks, so a 1.5pt line holds up on Mist.
  "--ui-glyph-find": "oklch(0.52 0.17 259)",
  "--ui-glyph-apply": "oklch(0.52 0.13 153)",
  "--ui-glyph-pro": "oklch(0.55 0.21 350)",
  "--ui-pill": "oklch(0 0 0 / 0.06)",
  "--ui-seg-on": "oklch(1 0 0)",
  "--ui-outline": "oklch(0.18 0.006 285 / 0.16)",
  "--ui-paper": "oklch(0.962 0.003 80)",
  // A sheet is Mist like the page, and its groups and fields are white.
  "--ui-sheet": "oklch(0.979 0.001 285)",
  "--ui-sheet-group": "oklch(1 0 0)",
  "--ui-scrim": "oklch(0.18 0.006 285 / 0.32)",
  "--ui-image-outline": "oklch(0 0 0 / 0.1)",
  "--ui-grain": "oklch(0.36 0.04 60 / 0.26)",
  "--ui-shadow-card": "0px 1px 1px oklch(0.33 0.025 50 / 0.06), 0px 10px 18px -12px oklch(0.33 0.025 50 / 0.28)",
  "--ui-shadow-hole": "inset 0px 2px 2.5px oklch(0.25 0.03 40 / 0.28)",
  "--ui-shadow-pill": "0px 0px 0px 0.5px oklch(0 0 0 / 0.08), 0px 2px 4px oklch(0.33 0.025 50 / 0.08), 0px 12px 28px -6px oklch(0.33 0.025 50 / 0.18)",
} as const;

/** Increased contrast on dark: brighter secondary ink and lines, and the
 * deeper pink under white text so it passes 4.5:1 (what Apple asks for the
 * App Store's Sufficient Contrast label). */
export const uiContrast = {
  "--ui-accent-fill": "oklch(0.57 0.205 350)",
  "--ui-ink-2": "oklch(0.88 0.005 285)",
  "--ui-ink-3": "oklch(0.76 0.006 285)",
  "--ui-ink-4": "oklch(0.62 0.006 285)",
  "--ui-separator": "oklch(0.38 0.006 285)",
  "--ui-outline": "oklch(1 0 0 / 0.3)",
} as const;

/** Increased contrast on light, applied after `uiLight`. */
export const uiContrastLight = {
  "--ui-accent-fill": "oklch(0.57 0.205 350)",
  "--ui-ink-2": "oklch(0.3 0.006 285)",
  "--ui-ink-3": "oklch(0.42 0.006 285)",
  "--ui-ink-4": "oklch(0.68 0.004 285)",
  "--ui-separator": "oklch(0.18 0.006 285 / 0.2)",
  "--ui-outline": "oklch(0.18 0.006 285 / 0.3)",
} as const;

/**
 * Type follows Apple's text styles, so it can scale with the iPhone's text
 * size. `display` is Founders Grotesk Semibold, `text` is Untitled Sans and
 * `system` is the iOS font (tab labels). Sizes and line heights are points.
 */
export const uiType = {
  largeTitle: { face: "display", size: 34, line: 41, tracking: -0.34 },
  title1: { face: "display", size: 28, line: 34, tracking: -0.28 },
  title2: { face: "display", size: 22, line: 28, tracking: 0 },
  body: { face: "text", size: 17, line: 22, tracking: 0 },
  longText: { face: "text", size: 17, line: 24, tracking: 0 },
  subhead: { face: "text", size: 15, line: 20, tracking: 0 },
  footnote: { face: "text", size: 13, line: 18, tracking: 0 },
  tab: { face: "system", size: 10, line: 12, tracking: 0 },
} as const;

/** The 4pt grid. Rhythm: 4–8 inside an item, 12–16 in a group, 24–32 between sections. */
export const uiSpace = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 } as const;

/** Logos and small controls, cards and grouped lists, the ticket and sheets, capsules. */
export const uiRadius = { sm: 8, md: 12, lg: 16, full: 999 } as const;

/**
 * Fixed sizes. A job row is three 20pt lines (84 with its padding); as in
 * Gmail, the 40pt logo is the height of the first two and sits on the 16
 * margin, so row text and separators start on the 68 line. Buttons are
 * Apple's 50.
 */
export const uiSize = {
  gutter: 16,
  keyline: 68,
  jobRow: 84,
  listRow: 44,
  button: 50,
  chip: 32,
  iconButton: 44,
  logo: 40,
  logoLarge: 48,
  hole: 24,
} as const;

/**
 * Motion, chosen in the Motion lab (owner, 2026-10-12; the Paper page
 * "Motion and icons · Oct 12" is the spec). Sheets open, close and settle
 * like Vaul's drawer: one curve, quick off the mark with a long soft
 * landing; between steps each step is its own card and slides. The tab
 * bar's oval glides on a spring given as Apple's two numbers: response in
 * seconds and damping, where 1 never overshoots (WWDC 2018, "Designing
 * Fluid Interfaces"). Durations are milliseconds; curves are cubic Béziers.
 */
export const uiMotion = {
  sheet: {
    open: { duration: 500, curve: [0.32, 0.72, 0, 1] },
    close: { duration: 500, curve: [0.32, 0.72, 0, 1] },
    settle: { duration: 500, curve: [0.32, 0.72, 0, 1] },
    /** Between steps each step is its own card (owner, 2026-10-13, from
     * the Sheet transitions lab): the new one slides in from the side at
     * its own size as the old one slides out the other way, on the drawer
     * curve in 400ms, as Ionic pushes iOS pages. */
    push: { duration: 400, curve: [0.32, 0.72, 0, 1] },
    /** A step whose content changes (a list loading in) eases to its new
     * height, standing on its bottom edge. */
    resize: { duration: 270, curve: [0.25, 1, 0.5, 1] },
    /** Let go past this share of the sheet's height, or flick down faster
     * than this many points a second, and it closes (Vaul's rule). */
    closeShare: 0.25,
    closeSpeed: 400,
  },
  tab: {
    glide: { response: 0.4, damping: 1 },
  },
  /** The stub tearing off on Apply: Peel, with a light rip (owner,
   * 2026-10-18, picked from four ways on the phone; Paper "The stub tears
   * off, frame by frame"). One continuous path: it tears from its left end
   * round a hinge on the right, speeding up as the holes give, then falls
   * under gravity behind the job page's bar, carrying on at the speed and
   * spin it tore with, so nothing stalls where the two meet. The Apply
   * button catches it with a dip. Undo runs the path back. */
  stub: {
    /** The tear: the free end turns this many degrees in this long. */
    tear: { duration: 160, angle: -4 },
    /** Points a second squared; how long (ms) the spin and the sideways
     * drift take to die away; how much it shrinks, and over how long. */
    fall: { gravity: 5200, spinDecay: 100, drift: 150, shrink: 0.04, shrinkTime: 350 },
    /** Light taps along the tear, closer and closer together. */
    rip: { ticks: 9 },
    catch: { scale: 0.97, down: 90, up: 200, curve: [0.23, 1, 0.32, 1] },
    /** Undo runs the path back at this share of the time it took. */
    rise: { pace: 0.8 },
  },
  /** A new step's rubber stamp coming down onto your stub: from larger and
   * clear, accelerating like a hand pressing down. */
  stamp: {
    land: { duration: 160, curve: [0.55, 0.085, 0.68, 0.53], from: 1.12 },
  },
  /** A punch card's hole as it's punched: in and back out, no overshoot. */
  punch: { scale: 0.82, down: 90, up: 200, curve: [0.23, 1, 0.32, 1] },
  /** Onboarding (the Onboarding Motion Lab, owner 2026-10-14; Paper
   * "Onboarding · the build · Oct 18"). The mess lands card by card, faster
   * and faster, each falling, hitting and settling with a little bounce; the
   * words rise once it has. Leave it to Pinkslip throws the mess off with
   * momentum, nearest the button first, as the button grows into page two.
   * Page two's rows rise straight and calm, one at a time, with no bounce
   * (owner, 2026-10-18: the lab's drop needed refining). */
  onboarding: {
    /** The cards land over `spread` ms from `from` points up, larger and
     * turned, on a spring that overshoots a little as they hit. */
    land: { spread: 860, from: -560, scale: 1.16, spin: 14, response: 0.42, damping: 0.7 },
    /** The headline and buttons rise this far, the buttons this much later. */
    words: { rise: 14, stagger: 90, response: 0.42, damping: 1 },
    /** Thrown at `speed` points a second under `gravity`, one card every
     * `stagger` ms, growing by `scale` as they leave. */
    throw: { duration: 600, gravity: 1400, speed: 1500, stagger: 26, scale: 0.12 },
    /** The button grows to the screen and pales into page two, which takes
     * over `handoff` of the way through. */
    bloom: { response: 0.5, damping: 1, pale: 300, handoff: 0.62 },
    /** Page two: the title, then each row rising `rise` points. */
    rows: { duration: 420, curve: [0.23, 1, 0.32, 1], rise: 8, delay: 120, stagger: 60 },
    /** I'm ready slides page two off to the feed. */
    leave: { response: 0.42, damping: 1 },
    /** The feed behind the questions, as each chip changes it: a job comes
     * in from `from` points up at `scale`, `stagger` ms after the one above;
     * one that no longer fits slides `out` points left and fades in
     * `outDuration` ms; the rest move to their new places on the spring. */
    feed: { from: -14, scale: 0.98, stagger: 28, out: -24, outDuration: 220, response: 0.42, damping: 0.88 },
    /** From one question to the next, the words slide this share of the
     * screen and fade, and the sheet eases to its new height. */
    step: { shift: 0.4, response: 0.42, damping: 1 },
  },
} as const;
