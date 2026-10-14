import { ICONS, type IconName, type PhosphorName } from "@pinkslip/domain/icons";
import {
  ArrowBendUpLeft, ArrowClockwise, ArrowCounterClockwise, ArrowSquareOut, ArrowUpRight, Bell, BookmarkSimple, Briefcase, Buildings, CalendarBlank,
  CaretLeft, CaretRight, CaretUpDown, ChartBar, ChatCircleDots, CircleHalf, ClipboardText, ClockCounterClockwise, Check, CheckCircle, Copy, CurrencyCircleDollar,
  DotsThree, EnvelopeSimple, EnvelopeSimpleOpen, Export, EyeSlash, FileText, Flag, GearSix, Ghost, GlobeHemisphereWest, IdentificationBadge, MagnifyingGlass, MapPin,
  PaperPlaneTilt, PathIcon, Plus, Prohibit, Robot, SignOut, SlidersHorizontal, Sparkle, Swatches, ThumbsDown, Ticket, UserCircle, UsersThree,
  WarningCircle, Wrench, X,
  type Icon as PhosphorIcon, type IconProps as PhosphorProps,
} from "phosphor-react-native";
import type { ComponentType } from "react";
import Svg, { Path, Rect, type SvgProps } from "react-native-svg";
import { useUnistyles } from "react-native-unistyles";
import type { TextTone } from "./Text";

// Every Phosphor name the shared table uses needs its component here: a
// missing one fails to compile.
const components: Record<PhosphorName, PhosphorIcon> = {
  ArrowBendUpLeft, ArrowClockwise, ArrowCounterClockwise, ArrowSquareOut, ArrowUpRight, Bell, BookmarkSimple, Briefcase, Buildings, CalendarBlank,
  CaretLeft, CaretRight, CaretUpDown, ChartBar, ChatCircleDots, CircleHalf, ClipboardText, ClockCounterClockwise, Check, CheckCircle, Copy, CurrencyCircleDollar,
  DotsThree, EnvelopeSimple, EnvelopeSimpleOpen, Export, EyeSlash, FileText, Flag, GearSix, Ghost, GlobeHemisphereWest, IdentificationBadge, MagnifyingGlass, MapPin,
  PaperPlaneTilt, Plus, Prohibit, Robot, SignOut, SlidersHorizontal, Sparkle, Swatches, ThumbsDown, Ticket, UserCircle, UsersThree,
  WarningCircle, Wrench, X,
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
  /** A color that isn't a text tone: a settings tile's blue or green ink. */
  color?: string;
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
export function Icon({ name, size = 20, tone = "ink", color: tint, weight = "line", stroke }: IconProps) {
  const { theme } = useUnistyles();
  const Glyph = components[ICONS[name]] as Glyph;
  const color = tint ?? theme.ui.color[tone];
  if (name === "copy" && weight === "line") return <CopyMark size={size} color={color} stroke={stroke ?? ICON_STROKE} />;
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

/** Copy (Paper "You · Oct 14", copy D, owner 2026-10-14): two squares with
 * the same soft corner, the back one showing only where the front doesn't
 * cover it. Drawn on a 20pt grid; the stroke stays `stroke` points at any size. */
function CopyMark({ size, color, stroke }: { size: number; color: string; stroke: number }) {
  const width = stroke * (20 / size);
  return <Svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={3.25} y={6.75} width={10} height={10} rx={2.5} />
    <Path d="M6.75 5.75A2.5 2.5 0 0 1 9.25 3.25H14.25A2.5 2.5 0 0 1 16.75 5.75V10.75A2.5 2.5 0 0 1 14.25 13.25" />
  </Svg>;
}
