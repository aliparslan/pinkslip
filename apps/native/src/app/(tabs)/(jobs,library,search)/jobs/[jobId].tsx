import { Stack, useLocalSearchParams } from "expo-router";
import { JobDetail } from "../../../../features/job-detail/JobDetail";
import { useRedesign } from "../../../../features/redesign/flag";
import { JobPage } from "../../../../features/redesign/JobPage";

export default function JobScreen() {
  const { jobId, outreach } = useLocalSearchParams<{ jobId: string; outreach?: string }>();
  const redesign = useRedesign();
  if (redesign) return <JobPage jobId={jobId} outreachThread={outreach} />;
  return <>
    <Stack.Screen options={{ title: "" }} />
    <JobDetail jobId={jobId} outreachThread={outreach} />
  </>;
}
