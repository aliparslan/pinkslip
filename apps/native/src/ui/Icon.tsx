import { ICONS, type IconName } from "@pinkslip/domain/icons";
import { SymbolView, type SymbolViewProps, type SymbolWeight } from "expo-symbols";
import { useUnistyles } from "react-native-unistyles";
import type { TextTone } from "./Text";

type SFSymbol = Extract<SymbolViewProps["name"], string>;

// Every symbol the shared table names must exist in SF Symbols: this fails to
// compile when one doesn't.
type TableSymbols = { [K in IconName]: (typeof ICONS)[K]["sf"] };
const symbols: Record<IconName, SFSymbol> = Object.fromEntries(
  Object.entries(ICONS).map(([name, icon]) => [name, icon.sf]),
) as TableSymbols;

export type { IconName };

export interface IconProps {
  name: IconName;
  /** Points; the symbol is drawn inside a square this size. */
  size?: number;
  tone?: TextTone | "ink-4";
  /** Match the weight of the text beside it: regular for body, medium for labels. */
  weight?: Extract<SymbolWeight, "regular" | "medium" | "semibold">;
}

/** An SF Symbol from the shared icon table (shared/icons.ts), in ink. */
export function Icon({ name, size = 20, tone = "ink", weight = "regular" }: IconProps) {
  const { theme } = useUnistyles();
  return <SymbolView name={symbols[name]} size={size} weight={weight} tintColor={theme.ui.color[tone]} resizeMode="scaleAspectFit"
    style={{ width: size, height: size }} />;
}
