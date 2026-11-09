import { ICONS, type IconName, type PhosphorName } from "@pinkslip/domain/icons";
import {
  ArrowBendUpLeft, ArrowClockwise, ArrowsClockwise, ArrowSquareOut, ArrowUpRight, ArrowUUpLeft, Bell, BookmarkSimple, Briefcase, BookmarksSimple, Buildings, CalendarBlank, CalendarCheck, CalendarPlus,
  CaretDown, CaretLeft, CaretRight, CaretUp, CaretUpDown, ChartBar, ChatCircleDots, CircleHalf, ClipboardText, Clock, ClockCounterClockwise, Check, CheckCircle, CloudSlash, Compass, Copy, CurrencyCircleDollar,
  DotsThree, EnvelopeSimple, EnvelopeSimpleOpen, Export, Eye, EyeSlash, FileText, Flag, Funnel, GearSix, Ghost, Gift, GlobeHemisphereWest, HandSwipeRight, Heart, Hourglass, IdentificationBadge, Info, Lock, MagnifyingGlass, MapPin, PencilSimple,
  PaperPlaneTilt, PathIcon, Plus, Prohibit, Robot, Scales, SignOut, SlidersHorizontal, Sparkle, Swatches, ThumbsDown, Ticket, Trash, UploadSimple, UserCircle, UsersThree,
  Warning, WarningCircle, Wrench, X, XCircle,
  type Icon as PhosphorIcon, type IconProps as PhosphorProps,
} from "phosphor-react-native";
import type { ComponentType } from "react";
import Svg, { Circle, Path, Rect, type SvgProps } from "react-native-svg";
import { useUnistyles } from "react-native-unistyles";
import { TAB_ICON_FILLS, type TabIconName } from "./tab-icons";
import type { TextTone } from "./Text";

// Every Phosphor name the shared table uses needs its component here: a
// missing one fails to compile.
const components: Record<PhosphorName, PhosphorIcon> = {
  ArrowBendUpLeft, ArrowClockwise, ArrowsClockwise, ArrowSquareOut, ArrowUpRight, ArrowUUpLeft, Bell, BookmarkSimple, Briefcase, BookmarksSimple, Buildings, CalendarBlank, CalendarCheck, CalendarPlus,
  CaretDown, CaretLeft, CaretRight, CaretUp, CaretUpDown, ChartBar, ChatCircleDots, CircleHalf, ClipboardText, Clock, ClockCounterClockwise, Check, CheckCircle, CloudSlash, Compass, Copy, CurrencyCircleDollar,
  DotsThree, EnvelopeSimple, EnvelopeSimpleOpen, Export, Eye, EyeSlash, FileText, Flag, Funnel, GearSix, Ghost, Gift, GlobeHemisphereWest, HandSwipeRight, Heart, Hourglass, IdentificationBadge, Info, Lock, MagnifyingGlass, MapPin, PencilSimple,
  PaperPlaneTilt, Plus, Prohibit, Robot, Scales, SignOut, SlidersHorizontal, Sparkle, Swatches, ThumbsDown, Ticket, Trash, UploadSimple, UserCircle, UsersThree,
  Warning, WarningCircle, Wrench, X, XCircle,
  // The package exports this one as PathIcon (Path would clash with SVG's).
  Path: PathIcon,
};

export type { IconName, TabIconName };

/** The line is proportional to the icon (owner, 2026-10-15, replacing one
 * 1.75pt line at any size): 1.75pt at 24, so 1.46 at 20 and 0.88 at 12. A
 * small icon reads lighter, as Untitled Sans does at small sizes. */
export const LINE = 1.75 / 24;
/** The lit tab, and a small check on pink: 2pt at 24, scaled the same way. */
export const LIT_LINE = 2 / 24;

/** An icon's line in points at this size. */
export function iconLine(size: number, lit = false) {
  return size * (lit ? LIT_LINE : LINE);
}

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
  /** Line at rest; fill for a saved mark and a selected tab. */
  weight?: "line" | "fill";
  /** The heavier line: the lit tab, a check on pink. */
  lit?: boolean;
  /** A line in points that isn't proportional (the sheet's 2pt Back). A
   * filled icon takes it too, for its lines. */
  stroke?: number;
}

/**
 * A Phosphor icon from the shared icon table (shared/icons.ts), the same one
 * the web draws. Line icons take the heaviest Phosphor weight that's no
 * thicker than their line at this size, then an outline stroke makes up the
 * rest, so every icon reads in proportion.
 */
export function Icon({ name, size = 20, tone = "ink", color: tint, weight = "line", lit = false, stroke }: IconProps) {
  const { theme } = useUnistyles();
  const Glyph = components[ICONS[name]] as Glyph;
  const color = tint ?? theme.ui.color[tone];
  const line = stroke ?? iconLine(size, lit);
  if (name === "copy" && weight === "line") return <CopyMark size={size} color={color} stroke={line} />;
  if (name === "pick") return <PickMark size={size} color={color} stroke={line} />;
  if (name === "autoApply") return <BotMark size={size} color={color} stroke={line} filled={weight === "fill"} />;
  // The stroke straddles the outline, so it adds its whole width; the viewBox is 256 wide.
  const outline = (extra: number) => extra > 0.5 ? { stroke: color, strokeWidth: extra, strokeLinejoin: "round" as const } : null;
  if (weight === "fill") {
    // Phosphor's filled glyphs draw their lines at the regular weight.
    return <Glyph size={size} weight="fill" color={color} {...stroke || lit ? outline((line - size * (16 / 256)) * (256 / size)) : null} />;
  }
  const [base, perPoint] = LINE_WEIGHTS.find(([, perPoint]) => size * perPoint <= line) ?? LINE_WEIGHTS[3];
  return <Glyph size={size} weight={base} color={color} {...outline((line - size * perPoint) * (256 / size))} />;
}

/** A tab's icon: the same drawing at rest and selected, filled in when
 * selected (tab-icons.ts). */
export function TabIcon({ name, size = 24, selected }: { name: TabIconName; size?: number; selected: boolean }) {
  const { theme } = useUnistyles();
  // Read on every render, resting too: useUnistyles only follows a theme change
  // for what's been read, and a tab selected later came up in the old theme.
  const ink = theme.ui.color.ink;
  const fill = selected ? TAB_ICON_FILLS[name] : undefined;
  if (!fill) return <Icon name={name} size={size} tone={selected ? "ink" : "ink-2"} />;
  // The same outline the resting icon adds to Phosphor's regular line.
  const edge = { strokeWidth: LINE * 256 - 16, strokeLinejoin: "round" as const };
  return <Svg width={size} height={size} viewBox="0 0 256 256">
    <Path d={fill.solid} fillRule="evenodd" fill={ink} stroke={ink} {...edge} />
  </Svg>;
}

/** "Pinkslip does it for you" (B2, owner 2026-10-14; Paper System, Parts):
 * an antenna with a ball, a round head and two pill eyes, on Phosphor's 256
 * grid. It replaces Phosphor Robot, whose mouth filled in at small sizes. */
function BotMark({ size, color, stroke, filled }: { size: number; color: string; stroke: number; filled?: boolean }) {
  const line = stroke * (256 / size);
  // Filled parts grow by the line beyond Phosphor's regular weight, as outlined glyphs do.
  const edge = { fill: color, stroke: color, strokeWidth: Math.max(0, line - 16), strokeLinejoin: "round" as const };
  if (filled) {
    // Solid, with the eyes cut out, for a swipe's capsule (owner, 2026-11-08).
    return <Svg width={size} height={size} viewBox="0 0 256 256">
      <Path d="M128 46V70" fill="none" stroke={color} strokeWidth={Math.max(line, 20)} strokeLinecap="round" />
      <Circle cx={128} cy={28} r={18} fill={color} />
      <Path fillRule="evenodd" fill={color} d={`${roundedRect(36, 74, 184, 140, 50)}${roundedRect(80, 118, 30, 50, 15)}${roundedRect(146, 118, 30, 50, 15)}`} />
    </Svg>;
  }
  return <Svg width={size} height={size} viewBox="0 0 256 256">
    <Path d="M128 46V70" fill="none" stroke={color} strokeWidth={line} strokeLinecap="round" />
    <Circle cx={128} cy={28} r={16} {...edge} />
    <Rect x={36} y={74} width={184} height={140} rx={50} fill="none" stroke={color} strokeWidth={line} />
    <Rect x={80} y={118} width={30} height={50} rx={15} {...edge} />
    <Rect x={146} y={118} width={30} height={50} rx={15} {...edge} />
  </Svg>;
}

/** A rounded rectangle as path data, so shapes can cut each other out. */
function roundedRect(x: number, y: number, width: number, height: number, r: number): string {
  return `M${x + r} ${y}H${x + width - r}A${r} ${r} 0 0 1 ${x + width} ${y + r}V${y + height - r}A${r} ${r} 0 0 1 ${x + width - r} ${y + height}`
    + `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + height - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

/** The up-and-down caret of a row whose value opens the iPhone's menu: two
 * chevrons on Phosphor's 256 grid with more air between them than
 * CaretUpDown has (owner, 2026-10-15). */
function PickMark({ size, color, stroke }: { size: number; color: string; stroke: number }) {
  return <Svg width={size} height={size} viewBox="0 0 256 256" fill="none" stroke={color} strokeWidth={stroke * (256 / size)} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M80 88l48-48 48 48M80 168l48 48 48-48" />
  </Svg>;
}

/** Copy (Paper "You · Oct 14", copy D, owner 2026-10-14): two squares with
 * the same soft corner, the back one showing only where the front doesn't
 * cover it. Drawn on a 20pt grid; the stroke is `stroke` points. */
function CopyMark({ size, color, stroke }: { size: number; color: string; stroke: number }) {
  const width = stroke * (20 / size);
  return <Svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={3.25} y={6.75} width={10} height={10} rx={2.5} />
    <Path d="M6.75 5.75A2.5 2.5 0 0 1 9.25 3.25H14.25A2.5 2.5 0 0 1 16.75 5.75V10.75A2.5 2.5 0 0 1 14.25 13.25" />
  </Svg>;
}
