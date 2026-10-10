import { Stack, useLocalSearchParams } from "expo-router";
import { JobDetail } from "../../../../features/job-detail/JobDetail";

export default function JobScreen() {
  const { jobId, outreach } = useLocalSearchParams<{ jobId: string; outreach?: string }>();
  return <>
    <Stack.Screen options={{ title: "" }} />
    <JobDetail jobId={jobId} outreachThread={outreach} />
  </>;
}
