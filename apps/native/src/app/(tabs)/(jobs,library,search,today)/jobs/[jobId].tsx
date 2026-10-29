import { Stack, useLocalSearchParams } from "expo-router";
import { JobDetail } from "../../../../features/job-detail/JobDetail";
import { useRedesign } from "../../../../features/redesign/flag";
import { JobPage } from "../../../../features/redesign/JobPage";
import type { SendOpening } from "../../../../features/redesign/sends/LiveSends";
import { TabBarFollowsTransition } from "../../../../ui";

export default function JobScreen() {
  const { jobId, outreach, send } = useLocalSearchParams<{ jobId: string; outreach?: string; send?: SendOpening }>();
  const redesign = useRedesign();
  // The tab bar leaves and comes back with the list as this page comes and goes.
  return <>
    <TabBarFollowsTransition />
    {redesign ? <JobPage jobId={jobId} outreachThread={outreach} sendOpening={send} /> : <>
      <Stack.Screen options={{ title: "" }} />
      <JobDetail jobId={jobId} outreachThread={outreach} />
    </>}
  </>;
}
