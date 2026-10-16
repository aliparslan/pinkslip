import { Redirect } from "expo-router";
import { useRedesign } from "../../../../features/redesign/flag";
import { WhatsNewPage } from "../../../../features/redesign/whats-new";

/** What's new lives in the redesign's You. */
export default function WhatsNewScreen() {
  if (!useRedesign()) return <Redirect href="/you" />;
  return <WhatsNewPage />;
}
