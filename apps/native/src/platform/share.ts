import { Share } from "react-native";
import { WEB_URL } from "./session";

/** The system share sheet for a job's public page. Cancelling is normal. */
export async function shareJob(job: { id: string; title: string; company_name: string }) {
  const url = `${WEB_URL}/jobs/${encodeURIComponent(job.id)}`;
  await Share.share({ url, message: `${job.title} at ${job.company_name}` }).catch(() => undefined);
}
