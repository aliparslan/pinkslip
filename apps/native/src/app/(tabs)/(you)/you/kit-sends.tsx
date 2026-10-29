import { Redirect } from "expo-router";
import { SendStatesSample } from "../../../../features/kit/SendStatesSample";
import { redesignKitAvailable } from "../../../../features/redesign/flag";

/** Every send state, its sheets and its toasts, on samples. */
export default function SendStatesScreen() {
  if (!redesignKitAvailable) return <Redirect href="/you" />;
  return <SendStatesSample />;
}
