import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { haptics } from "../../platform/haptics";
import { toast } from "../../ui";

/** Where Stripe sends people after a tip: `pinkslip.work/support/thanks`
 * opens the app here as a universal link (or from the thanks page's button,
 * as `pinkslip://support/thanks`). It shows the heart toast (Paper "Support
 * Pinkslip · Oct 22", A2) on You.
 *
 * With the app already open, this screen lands on top of the tabs, so it
 * steps back to the You page the tip started from; opening You again would
 * stack a second one, and swiping back went You → You. Launched cold by the
 * link, there's nothing under it, so it opens You. */
export default function SupportThanks() {
  const [overApp] = useState(() => router.canGoBack());
  useEffect(() => {
    haptics.success();
    toast.success("Thank you for your support!", { icon: "support" });
    if (overApp) router.back();
  }, [overApp]);
  return overApp ? null : <Redirect href="/you" />;
}
