import type { SupportOffer } from "@pinkslip/domain/support";
import { useState } from "react";
import { Keyboard, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { AmountInput, Button, Choice, Choices, Segmented, SheetHeader, SheetModal, SheetStep, Text, useSheet } from "../../../ui";
import {
  defaultSupportPick, supportAmounts, supportButtonLabel, supportDollars, supportOffersMonthly, supportOtherOffered, supportPickOffered,
  supportTarget, type SupportOften, type SupportPick, type SupportTarget,
} from "./support-facts";

/** Support Pinkslip (Paper "Support Pinkslip · Oct 22", A, owner
 * 2026-10-22): Plan's See Pro sheet for a tip. One time or Monthly, the
 * amounts as radios, Other amount typed in its row (A3, A4, Oct 24), then
 * the pink button out to Stripe's page for that tip, which comes back to You
 * with the heart toast (app/support/thanks.tsx). */
export function SupportSheet({ open, onClosed, offer, onSupport }: {
  open: boolean;
  onClosed: () => void;
  offer: SupportOffer;
  /** Opens Stripe's page; the sheet closes once it has. */
  onSupport: (target: SupportTarget) => Promise<void>;
}) {
  return <SheetModal open={open} onClosed={onClosed}><SupportChoices offer={offer} onSupport={onSupport} /></SheetModal>;
}

function SupportChoices({ offer, onSupport }: { offer: SupportOffer; onSupport: (target: SupportTarget) => Promise<void> }) {
  const sheet = useSheet();
  const [often, setOften] = useState<SupportOften>("once");
  const [pick, setPick] = useState<SupportPick>(() => defaultSupportPick(offer, "once"));
  const [typed, setTyped] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const amounts = supportAmounts(offer, often);
  const target = supportTarget(offer, often, pick, typed);
  const choose = (next: SupportPick) => {
    if (next !== "other") Keyboard.dismiss();
    setPick(next);
  };
  const switchTo = (next: SupportOften) => {
    setOften(next);
    if (!supportPickOffered(offer, next, pick)) choose(defaultSupportPick(offer, next));
  };
  return <SheetStep id="support">
    <View style={styles.lead}>
      <SheetHeader title="Support Pinkslip" />
      <Text tone="ink-2">Pinkslip is a one-man team! A tip helps with server and compute costs 😊</Text>
    </View>
    {supportOffersMonthly(offer) ? <Segmented value={often} onChange={switchTo} segments={[
      { value: "once", label: "One time" },
      { value: "monthly", label: "Monthly" },
    ]} /> : null}
    {/* With only a link where Stripe asks the amount, there's nothing to
        pick here: the button goes straight to Stripe's page. */}
    {amounts.length ? <Choices>
      {amounts.map((dollars) => <Choice key={dollars} plain title={`$${dollars}`} selected={pick === dollars} onPress={() => choose(dollars)} />)}
      {supportOtherOffered(offer, often) ? <Choice plain title="Other amount" selected={pick === "other"} onPress={() => choose("other")}
        trailing={offer.checkout && (pick === "other" || typed !== null) ? <AmountInput value={typed} onChange={setTyped} max={offer.checkout.max}
          focused={pick === "other"} onFocus={() => setPick("other")} label="Other amount, in dollars" /> : undefined} /> : null}
    </Choices> : null}
    <Button variant="primary" fullWidth icon="apply" iconAfter disabled={!target} pending={busy} onPress={() => {
      if (!target) return;
      setBusy(true);
      onSupport(target).then(sheet.close, () => setBusy(false));
    }}>{supportButtonLabel(often, supportDollars(offer, pick, typed))}</Button>
  </SheetStep>;
}

const styles = StyleSheet.create((theme) => ({
  lead: { gap: theme.ui.space["2"] },
}));
