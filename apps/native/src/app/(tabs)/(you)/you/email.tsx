import { useLocalSearchParams } from "expo-router";
import { SampleEmailTrackingPage, sampleTrackingState } from "../../../../features/kit/email-sample";
import { EmailTrackingPage } from "../../../../features/redesign/email/EmailTrackingPage";
import { redesignKitAvailable } from "../../../../features/redesign/flag";

/** You → Email tracking. The redesign kit opens it on sample data with
 * `?sample=on|waiting|off`. */
export default function EmailTrackingScreen() {
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  const state = redesignKitAvailable ? sampleTrackingState(sample) : null;
  return state ? <SampleEmailTrackingPage key={state} state={state} /> : <EmailTrackingPage />;
}
