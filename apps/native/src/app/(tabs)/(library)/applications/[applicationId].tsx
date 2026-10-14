import { useLocalSearchParams } from "expo-router";
import { SampleApplicationPage, sampleState } from "../../../../features/kit/application-sample";
import { redesignKitAvailable } from "../../../../features/redesign/flag";
import { ApplicationPage } from "../../../../features/redesign/ApplicationPage";

export default function ApplicationScreen() {
  const { applicationId } = useLocalSearchParams<{ applicationId: string }>();
  // The redesign kit's samples open here too, so they sit exactly where the real page does.
  const sample = redesignKitAvailable ? sampleState(applicationId) : null;
  if (sample) return <SampleApplicationPage key={sample} state={sample} />;
  return <ApplicationPage applicationId={applicationId} />;
}
