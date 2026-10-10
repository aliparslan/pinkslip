import { Share } from "react-native";
import { WEB_URL } from "./session";

/** The system share sheet for a job's public page. Cancelling is normal.
 * Only the link is shared: Messages builds its rich preview (the page's
 * title and image) from a bare URL, and extra text turns it into plain text. */
export async function shareJob(job: { id: string; title: string; company_name: string }) {
  const url = `${WEB_URL}/jobs/${encodeURIComponent(job.id)}`;
  await Share.share({ url, title: `${job.title} at ${job.company_name}` }).catch(() => undefined);
}
