import { Host, Image as SFImage, type ImageProps } from "@expo/ui/swift-ui";
import {
  ArrowBendUpLeft, ArrowSquareOut, Bell, BookmarkSimple, Briefcase, Buildings, CalendarBlank, Cards, ChatText, CheckCircle,
  CurrencyCircleDollar, DotsThree, EnvelopeSimple, Export, EyeSlash, FileText, Flag, GearSix, GlobeHemisphereWest,
  IdentificationBadge, Lightning, MagnifyingGlass, MapPin, PaperPlaneTilt, Prohibit, SealCheck, SignOut,
  SlidersHorizontal, Sparkle, Star, ThumbsDown, UserCircle, UsersThree, XCircle, type Icon as PhosphorIcon,
} from "phosphor-react-native";
import { ScrollView, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { SectionHeader, Text } from "../../ui";

type SFSymbol = NonNullable<ImageProps["systemName"]>;

interface Concept {
  label: string;
  sf: SFSymbol;
  phosphor: PhosphorIcon;
  /** A stage of an application: also drawn as the ring that fills as it advances. */
  ring?: number;
}

const groups: { title: string; concepts: Concept[] }[] = [
  { title: "Tabs and the bar", concepts: [
    { label: "Jobs", sf: "briefcase", phosphor: Briefcase },
    { label: "Search", sf: "magnifyingglass", phosphor: MagnifyingGlass },
    { label: "Tracker", sf: "rectangle.stack", phosphor: Cards },
    { label: "Saved", sf: "bookmark", phosphor: BookmarkSimple },
    { label: "You", sf: "person.crop.circle", phosphor: UserCircle },
    { label: "Edit search", sf: "slider.horizontal.3", phosphor: SlidersHorizontal },
    { label: "Notifications", sf: "bell", phosphor: Bell },
  ] },
  { title: "On a job", concepts: [
    { label: "Save", sf: "bookmark", phosphor: BookmarkSimple },
    { label: "Apply", sf: "arrow.up.right.square", phosphor: ArrowSquareOut },
    { label: "I applied", sf: "checkmark.circle", phosphor: CheckCircle },
    { label: "Share", sf: "square.and.arrow.up", phosphor: Export },
    { label: "More", sf: "ellipsis", phosphor: DotsThree },
    { label: "Hide job", sf: "eye.slash", phosphor: EyeSlash },
    { label: "Not interested", sf: "hand.thumbsdown", phosphor: ThumbsDown },
    { label: "Report", sf: "flag", phosphor: Flag },
    { label: "Block", sf: "nosign", phosphor: Prohibit },
    { label: "Tailor resume", sf: "sparkles", phosphor: Sparkle },
  ] },
  { title: "Application stages", concepts: [
    { label: "Saved", sf: "bookmark", phosphor: BookmarkSimple, ring: 0 },
    { label: "Applied", sf: "paperplane", phosphor: PaperPlaneTilt, ring: 0.25 },
    { label: "Interview", sf: "person.2", phosphor: UsersThree, ring: 0.5 },
    { label: "Offer", sf: "star", phosphor: Star, ring: 0.75 },
    { label: "Accepted", sf: "checkmark.seal", phosphor: SealCheck, ring: 1 },
    { label: "Closed", sf: "xmark.circle", phosphor: XCircle, ring: -1 },
  ] },
  { title: "Email and people", concepts: [
    { label: "Email", sf: "envelope", phosphor: EnvelopeSimple },
    { label: "Send", sf: "paperplane", phosphor: PaperPlaneTilt },
    { label: "Follow up", sf: "arrowshape.turn.up.left", phosphor: ArrowBendUpLeft },
    { label: "Recruiter", sf: "person.text.rectangle", phosphor: IdentificationBadge },
    { label: "Companies", sf: "building.2", phosphor: Buildings },
  ] },
  { title: "Facts and settings", concepts: [
    { label: "Location", sf: "mappin", phosphor: MapPin },
    { label: "Pay", sf: "dollarsign.circle", phosphor: CurrencyCircleDollar },
    { label: "Visa", sf: "globe", phosphor: GlobeHemisphereWest },
    { label: "Deadline", sf: "calendar", phosphor: CalendarBlank },
    { label: "Resume", sf: "doc.text", phosphor: FileText },
    { label: "Answers", sf: "text.bubble", phosphor: ChatText },
    { label: "Auto-apply", sf: "bolt", phosphor: Lightning },
    { label: "Settings", sf: "gearshape", phosphor: GearSix },
    { label: "Sign out", sf: "rectangle.portrait.and.arrow.right", phosphor: SignOut },
  ] },
];

// SF Symbols, then Phosphor (today's icons) in four weights, then the stage ring.
const columns = ["SF", "Reg", "Bold", "Duo", "Fill"] as const;
const SIZE = 22;

/** Dev-only: every concept the app draws, in SF Symbols and four Phosphor
 * weights, on the redesign's ink, so the set can be chosen side by side. */
export function IconSets() {
  const { theme } = useUnistyles();
  const ink = theme.ui.color.ink;
  return <ScrollView style={styles.screen} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
    <View style={styles.headerRow}>
      <View style={styles.labelCell} />
      {columns.map((column) => <View key={column} style={styles.cell}><Text role="footnote" tone="ink-3" align="center">{column}</Text></View>)}
      <View style={styles.cell}><Text role="footnote" tone="ink-3" align="center">Ring</Text></View>
    </View>
    {groups.map((group) => <View key={group.title}>
      <SectionHeader title={group.title} />
      {group.concepts.map((concept) => <View key={`${group.title}-${concept.label}`} style={styles.row}>
        <View style={styles.labelCell}><Text role="subhead" lines={1}>{concept.label}</Text></View>
        <View style={styles.cell}><Host matchContents><SFImage systemName={concept.sf} size={SIZE - 2} color={ink} /></Host></View>
        <View style={styles.cell}><concept.phosphor size={SIZE} color={ink} weight="regular" /></View>
        <View style={styles.cell}><concept.phosphor size={SIZE} color={ink} weight="bold" /></View>
        <View style={styles.cell}><concept.phosphor size={SIZE} color={ink} weight="duotone" duotoneColor={theme.ui.color.accent} duotoneOpacity={0.35} /></View>
        <View style={styles.cell}><concept.phosphor size={SIZE} color={ink} weight="fill" /></View>
        <View style={styles.cell}>{concept.ring === undefined ? null : <Ring progress={concept.ring} color={ink} />}</View>
      </View>)}
    </View>)}
  </ScrollView>;
}

/** The stage ring: dashed when saved, filling by quarters as an application
 * advances, crossed when it closes. */
function Ring({ progress, color }: { progress: number; color: string }) {
  const r = 8;
  const c = 11;
  if (progress === 0) return <Svg width={SIZE} height={SIZE}><Circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={1.75} strokeDasharray="2.6 2.4" /></Svg>;
  if (progress < 0) {
    return <Svg width={SIZE} height={SIZE}>
      <Circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={1.75} opacity={0.45} />
      <Path d={`M${c - 4} ${c - 4}L${c + 4} ${c + 4}M${c + 4} ${c - 4}L${c - 4} ${c + 4}`} stroke={color} strokeWidth={1.75} strokeLinecap="round" opacity={0.45} />
    </Svg>;
  }
  const inner = 5.5;
  const angle = progress * 2 * Math.PI;
  const x = c + inner * Math.sin(angle);
  const y = c - inner * Math.cos(angle);
  const wedge = progress >= 1
    ? <Circle cx={c} cy={c} r={inner} fill={color} />
    : <Path d={`M${c} ${c}V${c - inner}A${inner} ${inner} 0 ${progress > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`} fill={color} />;
  return <Svg width={SIZE} height={SIZE}><Circle cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={1.75} />{wedge}</Svg>;
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.ui.color.bg },
  content: { paddingBottom: theme.ui.space["10"] },
  headerRow: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: theme.ui.size.gutter, paddingVertical: theme.ui.space["2"] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: theme.ui.size.listRow,
    paddingHorizontal: theme.ui.size.gutter,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.ui.color.separator,
  },
  labelCell: { width: 104 },
  cell: { flex: 1, alignItems: "center", justifyContent: "center" },
}));
