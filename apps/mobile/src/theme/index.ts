/* The app's look, read from the generated tokens so it matches the web.

   Type is the system font (SF Pro): the brand faces ship on the web, and
   they come to the app once their license covers apps. Sizes, colors,
   radii, and control heights are the web's. */

import { useColorScheme, type TextStyle, type ViewStyle } from "react-native";
import { control, dark, light, radius, text } from "./tokens";

export { control, radius, text };
export type Palette = typeof light;

export function usePalette(): Palette {
  return useColorScheme() === "dark" ? (dark as Palette) : light;
}

export function useIsDark(): boolean {
  return useColorScheme() === "dark";
}

export type TextVariant = keyof typeof text;

/** Size and line height for a step of the type scale. Headings tighten. */
export function type(variant: TextVariant, weight: "regular" | "medium" | "semibold" = "regular"): TextStyle {
  const step = text[variant];
  const tight = variant === "heading" || variant === "title" || variant === "display" || variant === "hero";
  return {
    fontSize: step.size,
    lineHeight: step.lineHeight,
    fontWeight: weight === "semibold" ? "600" : weight === "medium" ? "500" : "400",
    letterSpacing: tight ? step.size * -0.012 : 0,
  };
}

/** A raised control: a soft top-to-bottom gradient and an edge that's
 * lighter on top, like the web's tactile skin. */
export function raised(palette: Palette): ViewStyle {
  return {
    backgroundColor: palette.skinBottom,
    experimental_backgroundImage: `linear-gradient(to bottom, ${palette.skinTop}, ${palette.skinBottom})`,
    borderWidth: 1,
    borderTopColor: palette.edgeTop,
    borderLeftColor: palette.line2,
    borderRightColor: palette.line2,
    borderBottomColor: palette.edgeBottom,
    boxShadow: `0 1px 2px ${palette.skinShadeSm}`,
  };
}

/** The pink primary: a gradient from a lighter, warmer top to the accent. */
export function accentFill(palette: Palette): ViewStyle {
  return {
    backgroundColor: palette.accent,
    experimental_backgroundImage: `linear-gradient(to bottom, ${palette.accentTop}, ${palette.accent})`,
    borderWidth: 1,
    borderTopColor: palette.accentEdgeTop,
    borderLeftColor: palette.accentEdge,
    borderRightColor: palette.accentEdge,
    borderBottomColor: palette.accentEdge,
    boxShadow: `0 1px 2px ${palette.skinShade}`,
  };
}

/** Pressed controls sink a little rather than lighting up. */
export const pressedScale: ViewStyle = { transform: [{ scale: 0.97 }] };
