import { ICONS, type IconName, type PhosphorName } from "@pinkslip/domain/icons";
import {
  ArrowBendUpLeft, ArrowClockwise, ArrowCounterClockwise, ArrowSquareOut, Bell, BookmarkSimple, Briefcase, Buildings, CalendarBlank,
  CaretLeft, CaretRight, ChatText, Check, CheckCircle, CurrencyCircleDollar, DotsThree, EnvelopeSimple, Export, EyeSlash, FileText, Flag,
  GearSix, GlobeHemisphereWest, IdentificationBadge, Lightning, MagnifyingGlass, MapPin, PaperPlaneTilt, PathIcon, Prohibit, SignOut,
  SlidersHorizontal, Sparkle, ThumbsDown, UserCircle, UsersThree, WarningCircle, X,
  type Icon as PhosphorIcon,
} from "phosphor-react-native";
import { useUnistyles } from "react-native-unistyles";
import type { TextTone } from "./Text";

// Every Phosphor name the shared table uses needs its component here: a
// missing one fails to compile.
const components: Record<PhosphorName, PhosphorIcon> = {
  ArrowBendUpLeft, ArrowClockwise, ArrowCounterClockwise, ArrowSquareOut, Bell, BookmarkSimple, Briefcase, Buildings, CalendarBlank,
  CaretLeft, CaretRight, ChatText, Check, CheckCircle, CurrencyCircleDollar, DotsThree, EnvelopeSimple, Export, EyeSlash, FileText, Flag,
  GearSix, GlobeHemisphereWest, IdentificationBadge, Lightning, MagnifyingGlass, MapPin, PaperPlaneTilt, Prohibit, SignOut,
  SlidersHorizontal, Sparkle, ThumbsDown, UserCircle, UsersThree, WarningCircle, X,
  // The package exports this one as PathIcon (Path would clash with SVG's).
  Path: PathIcon,
};

export type { IconName };

export interface IconProps {
  name: IconName;
  /** Points; the icon is drawn inside a square this size. */
  size?: number;
  tone?: TextTone | "ink-4";
  /** Regular at rest, fill for a selected tab or a saved mark, bold for small
   * marks that need weight (chevrons, checks). */
  weight?: "regular" | "bold" | "fill";
}

/** A Phosphor icon from the shared icon table (shared/icons.ts), the same one
 * the web draws. */
export function Icon({ name, size = 20, tone = "ink", weight = "regular" }: IconProps) {
  const { theme } = useUnistyles();
  const Glyph = components[ICONS[name]];
  return <Glyph size={size} weight={weight} color={theme.ui.color[tone]} />;
}
