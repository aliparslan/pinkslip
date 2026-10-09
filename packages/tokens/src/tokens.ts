/**
 * Pinkslip design tokens: the single source of truth for the generated web
 * stylesheet (`tokens.css`), the native values (`native.ts`) and the kit prop
 * unions (`types.ts`).
 *
 * `bun run generate` writes those files; `bun run check` fails when they drift.
 * Values mirror the frozen Svelte design exactly, and `check-equivalence.ts`
 * compares every resolved value against that frozen copy until chunk 3.4
 * deletes the old app.
 *
 * Modes are expressed the way the browser cascades them: `dark` is the base
 * semantic set, `light` overrides it, and the `prefers-contrast` media query
 * reuses the attribute-driven contrast values because WKWebView does not
 * reliably expose iOS Increase Contrast through media queries.
 */

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
  "--radius-sm": "6px",
  "--radius-md": "10px",
  "--radius-lg": "14px",
  "--radius-xl": "14px",
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
  "--color-accent": "oklch(0.78 0.153 350)",
  "--color-accent-ink": "oklch(0.16 0.01 350)",
  "--color-accent-soft": "oklch(0.255 0.055 350)",
  // Chroma sits at the sRGB ceiling for this L/H. Raising it does nothing on
  // screen — the browser gamut-maps it straight back down.
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
  "--color-accent-ink": "oklch(0.99 0.002 70)",
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
