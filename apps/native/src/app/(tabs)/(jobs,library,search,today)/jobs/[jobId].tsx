import { Stack, useLocalSearchParams } from "expo-router";
import { JobDetail } from "../../../../features/job-detail/JobDetail";
import { useRedesign } from "../../../../features/redesign/flag";
import { JobPage } from "../../../../features/redesign/JobPage";
import { TabBarFollowsTransition } from "../../../../ui";

export default function JobScreen() {
  const { jobId, outreach } = useLocalSearchParams<{ jobId: string; outreach?: string }>();
  const redesign = useRedesign();
  // The tab bar leaves and comes back with the list as this page comes and goes.
  return <>
    <TabBarFollowsTransition />
    {redesign ? <JobPage jobId={jobId} outreachThread={outreach} /> : <>
      <Stack.Screen options={{ title: "" }} />
      <JobDetail jobId={jobId} outreachThread={outreach} />
    </>}
  </>;
}
