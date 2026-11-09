import { ICONS, type IconName, type PhosphorName } from "@pinkslip/domain/icons";
import {
  ArrowBendUpLeft, ArrowClockwise, ArrowsClockwise, ArrowSquareOut, ArrowUpRight, ArrowUUpLeft, Bell, BookmarkSimple, Briefcase, BookmarksSimple, Buildings, CalendarBlank, CalendarCheck, CalendarPlus,
  CaretDown, CaretLeft, CaretRight, CaretUp, CaretUpDown, ChartBar, ChatCircleDots, CircleHalf, ClipboardText, Clock, ClockCounterClockwise, Check, CheckCircle, CloudSlash, Compass, Copy, CurrencyCircleDollar,
  DotsThree, EnvelopeSimple, EnvelopeSimpleOpen, Export, Eye, EyeSlash, FileText, Flag, Funnel, GearSix, Ghost, Gift, GlobeHemisphereWest, HandSwipeRight, Heart, Hourglass, IdentificationBadge, Info, Lock, MagnifyingGlass, MapPin, PencilSimple,
  PaperPlaneTilt, PathIcon, Plus, Prohibit, Robot, Scales, SignOut, SlidersHorizontal, Sparkle, Swatches, ThumbsDown, Ticket, Trash, UploadSimple, UserCircle, UsersThree,
  Warning, WarningCircle, Wrench, X, XCircle,
  type Icon as PhosphorIcon, type IconProps as PhosphorProps,
} from "phosphor-react-native";
import type { ComponentType, ReactElement } from "react";
import Svg, { Circle, Path, Rect, type SvgProps } from "react-native-svg";
import { useUnistyles } from "react-native-unistyles";
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

export type { IconName };

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

/** The five tab icons. */
export type TabIconName = Extract<IconName, "today" | "jobs" | "tracker" | "search" | "you">;

/** A selected tab, solid and in ink (owner, 2026-11-08). Phosphor's fills read
 * oddly at this size, so these five are drawn for Pinkslip on Phosphor's 256
 * grid (Paper, Today tab, "Icon sets"). Plain shapes, no masks. */
const LIT_TABS: Record<TabIconName, (color: string) => ReactElement> = {
  today: (color) => <>
    <Path fill={color} d="M32 94V74A30 30 0 0 1 62 44V60A20 20 0 0 0 102 60V44H154V60A20 20 0 0 0 194 60V44A30 30 0 0 1 224 74V94Z" />
    <Path fill={color} d="M32 108H224V194A30 30 0 0 1 194 224H62A30 30 0 0 1 32 194Z" />
    <Rect fill={color} x={72} y={18} width={20} height={54} rx={10} />
    <Rect fill={color} x={164} y={18} width={20} height={54} rx={10} />
  </>,
  jobs: (color) => <>
    <Path d="M88 80V58a26 26 0 0 1 26-26h28a26 26 0 0 1 26 26V80" fill="none" stroke={color} strokeWidth={18} />
    <Path fill={color} d="M24 130V98A26 26 0 0 1 50 72H206A26 26 0 0 1 232 98V130H158V124A12 12 0 0 0 146 112H110A12 12 0 0 0 98 124V130Z" />
    <Path fill={color} d="M24 142H98V146A12 12 0 0 0 110 158H146A12 12 0 0 0 158 146V142H232V194A26 26 0 0 1 206 220H50A26 26 0 0 1 24 194Z" />
    <Rect fill={color} x={110} y={122} width={36} height={26} rx={7} />
  </>,
  tracker: (color) => <>
    {/* The back bookmark is only the part the front one, and a gap, leave showing. */}
    <Path fill={color} d="M87.18 41A25 25 0 0 1 112 19H192A25 25 0 0 1 217 44V192A5 5 0 0 1 209.32 196.22L183 179.55V76A35 35 0 0 0 148 41Z" />
    <Path fill={color} stroke={color} strokeWidth={10} strokeLinejoin="round" d="M48 76A20 20 0 0 1 68 56H148A20 20 0 0 1 168 76V224L108 186L48 224Z" />
  </>,
  search: (color) => <>
    <Circle cx={112} cy={112} r={74} fill="none" stroke={color} strokeWidth={28} />
    <Path d="M168 168L222 222" fill="none" stroke={color} strokeWidth={28} strokeLinecap="round" />
  </>,
  you: (color) => <Path fill={color} fillRule="evenodd"
    d="M51.4 204.13A108 108 0 1 1 204.6 204.13A80 62 0 0 0 51.4 204.13ZM88 104a40 40 0 1 0 80 0a40 40 0 1 0-80 0Z" />,
};

/** A selected tab's icon. At rest a tab uses the ordinary `Icon`. */
export function LitTabIcon({ name, size = 24 }: { name: TabIconName; size?: number }) {
  const { theme } = useUnistyles();
  return <Svg width={size} height={size} viewBox="0 0 256 256">{LIT_TABS[name](theme.ui.color.ink)}</Svg>;
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
