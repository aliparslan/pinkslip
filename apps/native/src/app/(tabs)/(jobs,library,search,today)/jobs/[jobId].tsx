import { useLocalSearchParams } from "expo-router";
import { JobPage } from "../../../../features/redesign/JobPage";
import type { SendOpening } from "../../../../features/redesign/sends/LiveSends";
import { TabBarFollowsTransition } from "../../../../ui";

export default function JobScreen() {
  const { jobId, outreach, send } = useLocalSearchParams<{ jobId: string; outreach?: string; send?: SendOpening }>();
  // The tab bar leaves and comes back with the list as this page comes and goes.
  return <>
    <TabBarFollowsTransition />
    <JobPage jobId={jobId} outreachThread={outreach} sendOpening={send} />
  </>;
}
