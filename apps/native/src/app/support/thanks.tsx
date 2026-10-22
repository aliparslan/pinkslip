import { Redirect } from "expo-router";
import { useEffect } from "react";
import { haptics } from "../../platform/haptics";
import { toast } from "../../ui";

/** Where Stripe sends people after a tip: `pinkslip.work/support/thanks`
 * opens the app here as a universal link (or from the thanks page's button,
 * as `pinkslip://support/thanks`). It goes to You, with the heart toast
 * (Paper "Support Pinkslip · Oct 22", A2). */
export default function SupportThanks() {
  useEffect(() => {
    haptics.success();
    toast.success("Thank you for your support!", { icon: "support" });
  }, []);
  return <Redirect href="/you" />;
}
