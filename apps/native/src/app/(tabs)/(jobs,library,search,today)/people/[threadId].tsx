import { Redirect, useLocalSearchParams } from "expo-router";
import { SamplePersonPage } from "../../../../features/kit/outreach-sample";
import { redesignKitAvailable, useRedesign } from "../../../../features/redesign/flag";
import { PersonPage } from "../../../../features/redesign/outreach/PersonPage";

/** A person you've written to, or are about to (the redesign). */
export default function PersonScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  if (!useRedesign()) return <Redirect href="/" />;
  if (threadId.startsWith("sample-") && redesignKitAvailable) return <SamplePersonPage threadId={threadId} />;
  return <PersonPage threadId={threadId} />;
}
