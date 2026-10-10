import type { Icon as PhosphorIcon, IconWeight } from "phosphor-react-native";
import { useUnistyles } from "react-native-unistyles";
import type { TextTone } from "./Text";

export type IconSize = 14 | 16 | 18 | 20 | 24 | 28 | 32;

/** Phosphor, as on the web, at token sizes and ink tones. Decorative unless
 * the caller labels the control around it. */
export function Icon({ icon: Glyph, size = 20, tone = "ink-2", weight = "regular" }: { icon: PhosphorIcon; size?: IconSize; tone?: TextTone; weight?: IconWeight }) {
  const { theme } = useUnistyles();
  return <Glyph size={size} weight={weight} color={theme.colors[tone]} />;
}
