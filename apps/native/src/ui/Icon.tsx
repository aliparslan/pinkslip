import { ICONS, type IconName, type PhosphorName } from "@pinkslip/domain/icons";
import {
  ArrowBendUpLeft, ArrowClockwise, ArrowCounterClockwise, ArrowSquareOut, ArrowUpRight, Bell, BookmarkSimple, Briefcase, Buildings, CalendarBlank,
  CaretLeft, CaretRight, ChartBar, ChatText, ClockCounterClockwise, Check, CheckCircle, CurrencyCircleDollar, DotsThree, EnvelopeSimple, Export, EyeSlash, FileText, Flag,
  GearSix, Ghost, GlobeHemisphereWest, IdentificationBadge, Lightning, MagnifyingGlass, MapPin, PaperPlaneTilt, PathIcon, Plus, Prohibit, SignOut,
  SlidersHorizontal, Sparkle, ThumbsDown, UserCircle, UsersThree, WarningCircle, X,
  type Icon as PhosphorIcon, type IconProps as PhosphorProps,
} from "phosphor-react-native";
import type { ComponentType } from "react";
import type { SvgProps } from "react-native-svg";
import { useUnistyles } from "react-native-unistyles";
import type { TextTone } from "./Text";

// Every Phosphor name the shared table uses needs its component here: a
// missing one fails to compile.
const components: Record<PhosphorName, PhosphorIcon> = {
  ArrowBendUpLeft, ArrowClockwise, ArrowCounterClockwise, ArrowSquareOut, ArrowUpRight, Bell, BookmarkSimple, Briefcase, Buildings, CalendarBlank,
  CaretLeft, CaretRight, ChartBar, ChatText, ClockCounterClockwise, Check, CheckCircle, CurrencyCircleDollar, DotsThree, EnvelopeSimple, Export, EyeSlash, FileText, Flag,
  GearSix, Ghost, GlobeHemisphereWest, IdentificationBadge, Lightning, MagnifyingGlass, MapPin, PaperPlaneTilt, Plus, Prohibit, SignOut,
  SlidersHorizontal, Sparkle, ThumbsDown, UserCircle, UsersThree, WarningCircle, X,
  // The package exports this one as PathIcon (Path would clash with SVG's).
  Path: PathIcon,
};

export type { IconName };

/** Every line icon draws its strokes this thick, in points, at any size, so
 * a 12pt chevron and a 24pt tab sit at one weight beside Untitled Sans
 * (Regular stems are 1.4pt at 17pt, Medium 2.2pt). */
export const ICON_STROKE = 1.75;

/** Phosphor's line weights, as stroke width per unit of icon size. */
const LINE_WEIGHTS = [["bold", 24 / 256], ["regular", 16 / 256], ["light", 12 / 256], ["thin", 8 / 256]] as const;

/** IconBase spreads props it doesn't know onto the Svg, whose stroke the paths inherit. */
type Glyph = ComponentType<PhosphorProps & Pick<SvgProps, "stroke" | "strokeWidth" | "strokeLinejoin">>;

export interface IconProps {
  name: IconName;
  /** Points; the icon is drawn inside a square this size. */
  size?: number;
  tone?: TextTone | "ink-4";
  /** Line at rest; fill for a saved mark (and the selected Tracker tab's dot). */
  weight?: "line" | "fill";
  /** The stroke in points, when it isn't ICON_STROKE: the selected tab's is a
   * touch heavier. A filled icon takes it too, for its lines. */
  stroke?: number;
}

/**
 * A Phosphor icon from the shared icon table (shared/icons.ts), the same one
 * the web draws. Line icons take the heaviest Phosphor weight that's no
 * thicker than ICON_STROKE at this size, then an outline stroke makes up the
 * rest, so every icon reads at the same weight.
 */
export function Icon({ name, size = 20, tone = "ink", weight = "line", stroke }: IconProps) {
  const { theme } = useUnistyles();
  const Glyph = components[ICONS[name]] as Glyph;
  const color = theme.ui.color[tone];
  // The stroke straddles the outline, so it adds its whole width; the viewBox is 256 wide.
  const outline = (extra: number) => extra > 0.5 ? { stroke: color, strokeWidth: extra, strokeLinejoin: "round" as const } : null;
  if (weight === "fill") {
    // Phosphor's filled glyphs draw their lines at the regular weight.
    return <Glyph size={size} weight="fill" color={color} {...stroke ? outline((stroke - size * (16 / 256)) * (256 / size)) : null} />;
  }
  const target = stroke ?? ICON_STROKE;
  const [base, perPoint] = LINE_WEIGHTS.find(([, perPoint]) => size * perPoint <= target) ?? LINE_WEIGHTS[3];
  return <Glyph size={size} weight={base} color={color} {...outline((target - size * perPoint) * (256 / size))} />;
}
