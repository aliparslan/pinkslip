import { createIsomorphicFn } from "@tanstack/react-start";
import type { PublicJob, PublicJobList } from "@pinkslip/domain/public-jobs";

const publicFetch = createIsomorphicFn()
  .server(async (path: string) => {
    const { env } = await import("cloudflare:workers");
    // Construct a fresh request: SSR must never forward a visitor's credentials.
    return env.API.fetch(new Request(`https://pinkslip.work/api/v2/public${path}`, {
      headers: { Accept: "application/json" },
    }));
  })
  .client((path: string) => fetch(`/api/v2/public${path}`, { credentials: "omit" }));

export async function loadPublicJobs(): Promise<PublicJobList> {
  const response = await publicFetch("/jobs");
  if (!response.ok) throw new Error("Jobs couldn’t be loaded.");
  return response.json();
}

export async function loadPublicJob(id: string): Promise<PublicJob | null> {
  const response = await publicFetch(`/jobs/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("This job couldn’t be loaded.");
  return response.json();
}
