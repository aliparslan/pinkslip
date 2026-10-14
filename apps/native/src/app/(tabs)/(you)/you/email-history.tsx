import { useLocalSearchParams } from "expo-router";
import { SampleJobEmailsPage } from "../../../../features/kit/email-sample";
import { JobEmailsPage } from "../../../../features/redesign/email/JobEmailsPage";
import { redesignKitAvailable } from "../../../../features/redesign/flag";

/** Email tracking → Job emails. The redesign kit opens it on sample data. */
export default function JobEmailsScreen() {
  const { sample } = useLocalSearchParams<{ sample?: string }>();
  return redesignKitAvailable && sample ? <SampleJobEmailsPage /> : <JobEmailsPage />;
}
