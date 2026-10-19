import { router, usePathname } from "expo-router";
import { BrokenLink, ErrorPage } from "../features/redesign/JobPage";
import { EmptyState, StampedSlip } from "../ui";

/** Back to Jobs, under this page if it's there, in its place if the link
 * opened the app with nothing behind. */
const toJobs = () => router.dismissTo("/");

/** Back, or Jobs when there's nothing to go back to. */
const leave = () => (router.canGoBack() ? router.back() : toJobs());

/**
 * A link the app has no page for (W4, "A link that goes nowhere"; Paper
 * "Errors · Oct 15", on the Approved page): the blank slip stamped RETURN TO
 * SENDER with the link printed on it, and the way on to Jobs. Replaces Expo's
 * "Unmatched route" screen. A job or event link whose job is gone shows the
 * same slip from its own page.
 */
export default function NotFound() {
  const path = usePathname();
  return <ErrorPage onBack={leave}>
    <EmptyState art={<StampedSlip stamp="RETURN TO SENDER" detail="NO SUCH PAGE"><BrokenLink path={`pinkslip.work${path}`} /></StampedSlip>}
      title="This link goes nowhere" message="It may be old, or cut short."
      action={{ label: "Go to Jobs", onPress: toJobs }} />
  </ErrorPage>;
}
