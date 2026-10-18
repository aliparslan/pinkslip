import { Redirect } from "expo-router";
import { TearSample } from "../../../../features/kit/TearSample";
import { redesignKitAvailable } from "../../../../features/redesign/flag";

/** The job page's stub tear on a sample job. */
export default function TearSampleScreen() {
  if (!redesignKitAvailable) return <Redirect href="/you" />;
  return <TearSample />;
}
