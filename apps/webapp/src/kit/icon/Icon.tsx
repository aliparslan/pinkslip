import type { Icon as PhosphorIcon, IconWeight } from "@phosphor-icons/react";

/** The sizes the current app uses. Pick the one the Svelte screen used. */
export type IconSize = 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 22 | 24;

export interface IconProps {
  icon: PhosphorIcon;
  size?: IconSize;
  weight?: Extract<IconWeight, "regular" | "bold" | "fill">;
  /** Meaningful icons get a label; decorative ones stay hidden from assistive tech. */
  label?: string;
}

/** Phosphor icon in `currentColor`, so it follows the surrounding text tone. */
export function Icon({ icon: Glyph, size = 16, weight = "regular", label }: IconProps) {
  return label
    ? <Glyph size={size} weight={weight} role="img" aria-label={label} />
    : <Glyph size={size} weight={weight} aria-hidden focusable="false" />;
}
