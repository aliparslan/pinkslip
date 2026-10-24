import type { SupportLinks } from "@pinkslip/domain/support";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Button, Choice, Choices, Segmented, SheetHeader, SheetModal, SheetStep, Text, useSheet } from "../../../ui";
import {
  defaultSupportPick, supportAmounts, supportButtonLabel, supportPickOffered, supportUrl, type SupportOften, type SupportPick,
} from "./support-facts";

/** Support Pinkslip (Paper "Support Pinkslip · Oct 22", A, owner
 * 2026-10-22): Plan's See Pro sheet for a tip. One time or Monthly, the
 * amounts as radios, then the pink button out to that amount's Stripe page,
 * which comes back to You with the heart toast (app/support/thanks.tsx). */
export function SupportSheet({ open, onClosed, links, onSupport }: {
  open: boolean;
  onClosed: () => void;
  links: SupportLinks;
  /** Opens the Stripe page. */
  onSupport: (url: string) => void;
}) {
  return <SheetModal open={open} onClosed={onClosed}><SupportChoices links={links} onSupport={onSupport} /></SheetModal>;
}

function SupportChoices({ links, onSupport }: { links: SupportLinks; onSupport: (url: string) => void }) {
  const sheet = useSheet();
  const [often, setOften] = useState<SupportOften>("once");
  const [pick, setPick] = useState<SupportPick>(() => defaultSupportPick(links, "once"));
  const url = supportUrl(links, often, pick);
  const amounts = supportAmounts(links, often);
  const switchTo = (next: SupportOften) => {
    setOften(next);
    if (!supportPickOffered(links, next, pick)) setPick(defaultSupportPick(links, next));
  };
  return <SheetStep id="support">
    <View style={styles.lead}>
      <SheetHeader title="Support Pinkslip" />
      <Text tone="ink-2">Pinkslip is a one-man team! A tip helps with server and compute costs 😊</Text>
    </View>
    {links.monthly.length ? <Segmented value={often} onChange={switchTo} segments={[
      { value: "once", label: "One time" },
      { value: "monthly", label: "Monthly" },
    ]} /> : null}
    {/* With only the typed amount (the owner's one link, Oct 24), there's
        nothing to pick here: the button goes straight to Stripe's page. */}
    {amounts.length ? <Choices>
      {amounts.map((amount) => <Choice key={amount.dollars} plain title={`$${amount.dollars}`}
        selected={pick === amount.dollars} onPress={() => setPick(amount.dollars)} />)}
      {often === "once" && links.other ? <Choice plain title="Other amount" selected={pick === "other"} onPress={() => setPick("other")} /> : null}
    </Choices> : null}
    <Button variant="primary" fullWidth icon="apply" iconAfter disabled={!url} onPress={() => {
      if (!url) return;
      onSupport(url);
      sheet.close();
    }}>{supportButtonLabel(often, pick)}</Button>
  </SheetStep>;
}

const styles = StyleSheet.create((theme) => ({
  lead: { gap: theme.ui.space["2"] },
}));
