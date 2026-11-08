import { useSession } from "@pinkslip/data";
import { useWindowDimensions, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Menu, type MenuItem } from "../../../kit";
import { CompanyLogo, SwipeButton, Text, type IconName, type SwipeTone } from "../../../ui";
import { chooseSwipe, OUTER_CHOICES, SWIPE_CHOICES, useSwipeChoices, type SwipeChoice, type SwipeSide } from "../../jobs/swipe-choices";
import { logoUri } from "../../jobs/CompanyLogo";
import { YouPage } from "./Page";

type SFSymbol = NonNullable<MenuItem["icon"]>;

/** How each choice looks on a row and in the menu. Queue is Apply for me,
 * named for what a swipe does with it (owner, 2026-11-08). */
const LOOK: Record<SwipeChoice, { label: string; icon: IconName; tone: SwipeTone; symbol: SFSymbol }> = {
  save: { label: "Save", icon: "save", tone: "accent", symbol: "bookmark" },
  read: { label: "Read", icon: "read", tone: "find", symbol: "envelope.open" },
  applied: { label: "Applied", icon: "applied", tone: "apply", symbol: "checkmark.circle" },
  hide: { label: "Hide", icon: "hide", tone: "neutral", symbol: "eye.slash" },
  queue: { label: "Queue", icon: "autoApply", tone: "neutral", symbol: "paperplane" },
};

export function swipeChoiceLabel(choice: SwipeChoice): string {
  return LOOK[choice].label;
}

/**
 * You → Swipe actions (owner, 2026-11-08, Paper "Choosing swipe actions ·
 * Nov 8", B): each side drawn as a job row caught mid-swipe, its buttons
 * the controls. A tap opens the menu for that button, with no check: the
 * row already shows what's there (owner, 2026-11-08). One already in use
 * trades places with it, which the other card shows at once. The outer
 * button, filled, is the full swipe, and never Queue.
 */
export function SwipeActionsPage() {
  const choices = useSwipeChoices();
  const queue = Boolean(useSession().data?.me?.features?.auto_apply_send_enabled);
  return <YouPage title="Swipe actions" subtitle="A full swipe runs the outer one.">
    <Side side="right" title="Swipe right" slots={choices.right} queue={queue} />
    <Side side="left" title="Swipe left" slots={choices.left} queue={queue} />
  </YouPage>;
}

function Side({ side, title, slots, queue }: { side: SwipeSide; title: string; slots: readonly [SwipeChoice, SwipeChoice | null]; queue: boolean }) {
  const { width } = useWindowDimensions();
  const buttons = [0, 1].map((slot) => {
    const choice = slots[slot as 0 | 1];
    // Queue chosen on a phone where sends aren't open shows as an empty slot.
    const shown = choice && (choice !== "queue" || queue) ? choice : null;
    return <Slot key={slot} side={side} slot={slot as 0 | 1} choice={shown} queue={queue} />;
  });
  // A job row pushed aside: it runs off the card's far edge, so it reads as
  // the row itself, not a picture of one.
  const row = <View key="row" style={[styles.row, { width: width - 32 }]}>
    <CompanyLogo name="Stripe" uri={logoUri("stripe.com")} />
    <View style={styles.rowText}>
      <Text role="subhead" weight="medium" lines={1}>Software Engineer, New Grad</Text>
      <Text role="subhead" tone="ink-2" lines={1}>Stripe · New York · $165K</Text>
    </View>
    <Text role="subhead" tone="ink-3">2d</Text>
  </View>;
  return <View style={styles.side}>
    <View style={styles.label}><Text role="footnote" weight="medium" tone="ink-2">{title}</Text></View>
    <View style={[styles.card, side === "right" ? styles.cardRight : styles.cardLeft]}>
      {side === "right" ? [...buttons, row] : [row, buttons[1], buttons[0]]}
    </View>
  </View>;
}

function Slot({ side, slot, choice, queue }: { side: SwipeSide; slot: 0 | 1; choice: SwipeChoice | null; queue: boolean }) {
  const offered = (slot === 0 ? OUTER_CHOICES : SWIPE_CHOICES).filter((option) => option !== "queue" || queue);
  const items: MenuItem[] = [
    ...offered.map((option) => ({
      id: option, title: LOOK[option].label, icon: LOOK[option].symbol,
      onSelect: () => chooseSwipe(side, slot, option),
    })),
    ...(slot === 1 ? [{ id: "none", title: "None", onSelect: () => chooseSwipe(side, slot, null) }] : []),
  ];
  const where = `${side === "right" ? "Swipe right" : "Swipe left"}, ${slot === 0 ? "full swipe" : "second button"}`;
  return <Menu title="" items={items}>
    <View accessibilityRole="button" accessibilityLabel={`${where}, ${choice ? LOOK[choice].label : "None"}`}>
      {choice ? <SwipeButton action={LOOK[choice]} filled={slot === 0} /> : <View style={styles.empty}><Text role="footnote" weight="medium" tone="ink-3">None</Text></View>}
    </View>
  </Menu>;
}

const styles = StyleSheet.create((theme) => ({
  side: { gap: theme.ui.space["1"], paddingHorizontal: theme.ui.size.gutter },
  // On the cards' content edge, as a settings card's label is.
  label: { paddingHorizontal: theme.ui.space["4"] },
  card: {
    flexDirection: "row", alignItems: "center", gap: theme.ui.space["2"], paddingVertical: 10, overflow: "hidden",
    backgroundColor: theme.ui.color["bg-grouped"], borderRadius: theme.ui.radius.md, borderCurve: "continuous",
  },
  cardRight: { paddingLeft: theme.ui.space["4"] },
  cardLeft: { paddingRight: theme.ui.space["4"], justifyContent: "flex-end" },
  row: {
    flexShrink: 0, minHeight: 64, flexDirection: "row", alignItems: "center", gap: theme.ui.space["3"], paddingHorizontal: theme.ui.space["4"],
    backgroundColor: theme.ui.color.separator, borderRadius: 22, borderCurve: "continuous",
  },
  rowText: { flex: 1 },
  empty: {
    height: 56, minWidth: 72, alignItems: "center", justifyContent: "center", borderRadius: theme.ui.radius.full,
    borderWidth: 1.5, borderStyle: "dashed", borderColor: theme.ui.color["ink-4"],
  },
}));
