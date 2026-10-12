import { color, fontSize, layout, radius, shadow, sizing, space, ui } from "@pinkslip/tokens/native";

/** One theme per token mode. Everything except colors and shadows is shared,
 * so components read sizes from the theme too and stay in one vocabulary.
 * `ui` is the October 2026 redesign; `src/ui` reads only that, and screens
 * move to it one at a time. */
function theme(mode: keyof typeof color) {
  return {
    mode,
    colors: color[mode],
    shadow: shadow[mode],
    space,
    radius,
    fontSize,
    sizing,
    gutter: layout["screen-gutter"],
    ui: {
      color: ui.color[mode],
      shadow: ui.shadow[mode],
      type: ui.type,
      space: ui.space,
      radius: ui.radius,
      size: ui.size,
    },
  } as const;
}

export const themes = {
  dark: theme("dark"),
  light: theme("light"),
  contrast: theme("contrast"),
  lightContrast: theme("lightContrast"),
};

export type AppThemes = typeof themes;
export type ThemeName = keyof AppThemes;
export type AppTheme = AppThemes[ThemeName];
