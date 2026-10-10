import { usePublicJob } from "@pinkslip/data";
import { Heading, Screen, Spinner, Text } from "../../kit";

/** 6-A scaffold; 6.5 builds the full job page. */
export function JobDetail({ jobId }: { jobId: string; outreachThread?: string }) {
  const job = usePublicJob(jobId);
  if (job.isPending) return <Screen><Spinner /></Screen>;
  return <Screen>
    <Text tone="ink-3">{job.data?.company_name}</Text>
    <Heading variant="display-md">{job.data?.title ?? "Job"}</Heading>
  </Screen>;
}
