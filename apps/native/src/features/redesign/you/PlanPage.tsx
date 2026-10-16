import { useState } from "react";
import { Text as RNText, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button, Choice, Choices, ListGroup, ListItem, SheetHeader, SheetModal, SheetStep, Text, faces, useSheet } from "../../../ui";
import { ComingSoon, YouPage } from "./Page";

/** One of the weekly allowances on Free. */
export interface Allowance {
  label: string;
  used: number;
  limit: number;
}

export interface ProOption {
  id: string;
  title: string;
  price: string;
  /** What it comes to each week, under the longer ones. */
  weekly?: string;
}

/** Pro as sold in the App Store: by the week, month or three months. */
export const proOptions: readonly ProOption[] = [
  { id: "weekly", title: "Weekly", price: "$9.99" },
  { id: "monthly", title: "Monthly", price: "$24.99", weekly: "$5.77 a week" },
  { id: "quarterly", title: "3 months", price: "$59.99", weekly: "$4.61 a week" },
];

export interface PlanFreeViewProps {
  /** "Monday". */
  resets: string;
  allowances: readonly Allowance[];
  /** The cheapest week, "$4.61 a week". */
  from: string;
  onBuy: (optionId: string) => Promise<void>;
  onRestore: () => Promise<void>;
}

/** Plan on Free (Paper "You · Oct 14", Plan C, owner 2026-10-14): what's
 * left this week first, each meter full from the left and emptying from the
 * right; then Pro, the soft pink card, whose See Pro opens the sheet. */
export function PlanFreeView({ resets, allowances, from, onBuy, onRestore }: PlanFreeViewProps) {
  const [selling, setSelling] = useState(false);
  return <YouPage title="Plan">
    <View style={styles.lead}><Text tone="ink-2">{`Free · this week resets ${resets}`}</Text></View>
    <View style={styles.after}>
      <View style={styles.meters}>
        {allowances.map((allowance) => <Meter key={allowance.label} allowance={allowance} />)}
      </View>
      <Text role="footnote" tone="ink-3">Jobs, alerts, Tracker and applying yourself are always free.</Text>
    </View>
    <View style={styles.slot}>
      <View style={styles.pro}>
        <Slips />
        <View style={styles.proText}>
          <RNText style={styles.proTitle} maxFontSizeMultiplier={1.5}>Pro</RNText>
          <View style={styles.proLine}><Text role="subhead" tone="ink-2">No weekly limits, follow-ups sent for you, and full stats.</Text></View>
        </View>
        <View style={styles.proFoot}>
          <Text role="subhead" weight="medium">{`From ${from}`}</Text>
          <Button variant="primary" size="small" onPress={() => setSelling(true)}>See Pro</Button>
        </View>
      </View>
    </View>
    <ProSheet open={selling} onClosed={() => setSelling(false)} onBuy={onBuy} onRestore={onRestore} />
  </YouPage>;
}

/** "3 left" in Founders over what it's for, then one bar per use. */
function Meter({ allowance }: { allowance: Allowance }) {
  const left = Math.max(0, allowance.limit - allowance.used);
  return <View style={styles.meter} accessibilityLabel={`${left} of ${allowance.limit} left, ${allowance.label}`}>
    <View>
      <RNText style={styles.left} maxFontSizeMultiplier={1.4}>{`${left} left`}</RNText>
      <Text role="footnote" tone="ink-3">{allowance.label}</Text>
    </View>
    <View style={styles.bars}>
      {Array.from({ length: allowance.limit }, (_, index) => <View key={index} style={[styles.bar, index < left ? styles.barLeft : styles.barUsed]} />)}
    </View>
  </View>;
}

/** Two slips, the mark, tucked in the card's corner. */
function Slips() {
  return <View style={styles.slips} pointerEvents="none">
    <View style={[styles.slip, styles.backSlip]} />
    <View style={[styles.slip, styles.frontSlip]} />
  </View>;
}

/** Buying Pro (Plan C2): the three ways to pay, Get Pro, then Restore. The
 * same sheet is the paywall when a weekly allowance runs out. */
export function ProSheet({ open, onClosed, onBuy, onRestore, why }: {
  open: boolean;
  onClosed: () => void;
  onBuy: PlanFreeViewProps["onBuy"];
  onRestore: PlanFreeViewProps["onRestore"];
  /** From a Pro moment (M4): its first line says why it opened. */
  why?: string;
}) {
  return <SheetModal open={open} onClosed={onClosed}><ProChoices onBuy={onBuy} onRestore={onRestore} why={why} /></SheetModal>;
}

function ProChoices({ onBuy, onRestore, why }: Pick<PlanFreeViewProps, "onBuy" | "onRestore"> & { why?: string }) {
  const sheet = useSheet();
  const [picked, setPicked] = useState("monthly");
  const [busy, setBusy] = useState<"buy" | "restore" | null>(null);
  const run = (kind: "buy" | "restore", work: () => Promise<void>) => {
    setBusy(kind);
    work().then(sheet.close, () => setBusy(null));
  };
  return <SheetStep id="pro">
    <View style={styles.sheetLead}>
      <SheetHeader title="Pro" />
      <Text tone="ink-2">{why ?? "No weekly limits, follow-ups sent for you, and full stats."}</Text>
    </View>
    <Choices>
      {proOptions.map((option) => <Choice key={option.id} title={option.title} detail={option.weekly} value={option.price}
        selected={picked === option.id} onPress={() => setPicked(option.id)} />)}
    </Choices>
    <View style={styles.sheetActions}>
      <Button variant="primary" fullWidth pending={busy === "buy"} disabled={busy === "restore"} onPress={() => run("buy", () => onBuy(picked))}>Get Pro</Button>
      <Button variant="text" fullWidth pending={busy === "restore"} disabled={busy === "buy"} onPress={() => run("restore", onRestore)}>Restore purchases</Button>
    </View>
  </SheetStep>;
}

export interface PlanProViewProps {
  /** "Pro · Monthly". */
  plan: string;
  /** "Renews Nov 14 · $24.99, billed through Apple". */
  renews: string;
  week: ReadonlyArray<{ value: number; label: string }>;
  onChangePlan: () => void;
  onRestore: () => Promise<void>;
}

/** Plan once you're on Pro (Plan E): your plan, what Pinkslip did for you
 * this week with no limits, and the App Store's own controls. */
export function PlanProView({ plan, renews, week, onChangePlan, onRestore }: PlanProViewProps) {
  return <YouPage title="Plan">
    <View style={styles.slot}>
      <View style={styles.card}>
        <Text role="title2">{plan}</Text>
        <Text role="subhead" tone="ink-2">{renews}</Text>
      </View>
    </View>
    <View style={[styles.slot, styles.week]}>
      <View style={styles.weekLabel}>
        <Text role="footnote" weight="medium" tone="ink-2">This week</Text>
        <Text role="footnote" tone="ink-3">no limits</Text>
      </View>
      <View style={[styles.card, styles.numbers]}>
        {week.map((item) => <View key={item.label}>
          <RNText style={styles.number} maxFontSizeMultiplier={1.4}>{String(item.value)}</RNText>
          <Text role="footnote" tone="ink-3">{item.label}</Text>
        </View>)}
      </View>
    </View>
    <ListGroup surface="fill" footer="Cancel anytime in your iPhone's Settings, under Subscriptions. Pro runs until the end of what you paid for.">
      <ListItem title="Change plan" accessory="chevron" onPress={onChangePlan} />
      <ListItem title="Restore purchases" onPress={() => void onRestore()} />
    </ListGroup>
  </YouPage>;
}

/** Plan before Pro is on sale: the page waits, like Tailoring. */
export function PlanComing() {
  return <YouPage title="Plan"><ComingSoon title="Pro is coming" message="Applying for you and outreach, without weekly limits." /></YouPage>;
}

const styles = StyleSheet.create((theme) => ({
  slot: { paddingHorizontal: theme.ui.space["4"] },
  // The plan's line sits 12 under the title.
  lead: { paddingHorizontal: theme.ui.space["4"], marginTop: -theme.ui.space["3"] },
  after: { paddingHorizontal: theme.ui.space["4"], gap: theme.ui.space["3"] },
  meters: { flexDirection: "row", gap: theme.ui.space["3"] },
  meter: {
    flex: 1, gap: 10, padding: theme.ui.space["4"],
    borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-grouped"],
  },
  left: { fontFamily: faces.display, fontSize: 34, lineHeight: 40, color: theme.ui.color.ink },
  bars: { flexDirection: "row", gap: theme.ui.space["1"] },
  bar: { flex: 1, height: 6, borderRadius: 3 },
  barLeft: { backgroundColor: theme.ui.color.ink },
  barUsed: { backgroundColor: theme.ui.color.bg },
  pro: {
    gap: theme.ui.space["3"], padding: theme.ui.space["4"], overflow: "hidden",
    borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["accent-soft"],
  },
  proText: { gap: 2 },
  proTitle: { fontFamily: faces.display, fontSize: 28, lineHeight: 34, color: theme.ui.color.accent },
  // Clear of the slips in the corner.
  proLine: { paddingRight: 64 },
  proFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  slips: { position: "absolute", right: 14, top: 12, width: 66, height: 64 },
  slip: { position: "absolute", width: 30, height: 42, borderRadius: 4, borderCurve: "continuous", transformOrigin: "0% 0%" },
  backSlip: { left: 28, top: 2, transform: [{ rotate: "10deg" }], backgroundColor: theme.ui.color["accent-fill"], opacity: 0.3 },
  frontSlip: { left: 10, top: 12, transform: [{ rotate: "-6deg" }], backgroundColor: theme.ui.color["accent-fill"], boxShadow: "0px 4px 10px rgba(180, 40, 100, 0.18)" },
  sheetLead: { gap: theme.ui.space["2"] },
  sheetActions: { gap: theme.ui.space["2"] },
  card: {
    gap: theme.ui.space["1"], padding: theme.ui.space["4"],
    borderRadius: theme.ui.radius.md, borderCurve: "continuous", backgroundColor: theme.ui.color["bg-grouped"],
  },
  week: { gap: theme.ui.space["2"] },
  weekLabel: { flexDirection: "row", gap: 6 },
  numbers: { flexDirection: "row", gap: theme.ui.space["6"] },
  number: { fontFamily: faces.display, fontSize: 28, lineHeight: 34, color: theme.ui.color.ink },
}));
