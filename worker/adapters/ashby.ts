import type { ATSAdapter, JobListing, JobContent } from "./types";

const GRAPHQL_QUERY =
  "query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) { jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) { jobPostings { id title locationName departmentName publishedDate externalLink descriptionHtml compensationTierSummary } } }";

interface AshbyJobPosting {
  id: string;
  title: string;
  locationName: string;
  departmentName: string | null;
  publishedDate: string | null;
  externalLink: string;
  descriptionHtml: string | null;
  compensationTierSummary: string | null;
}

interface AshbyResponse {
  data: {
    jobBoard: {
      jobPostings: AshbyJobPosting[];
    };
  };
}

export class AshbyAdapter implements ATSAdapter {
  readonly name = "ashby";

  async fetchJobs(slug: string): Promise<JobListing[]> {
    try {
      const url =
        "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams";

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationName: "ApiJobBoardWithTeams",
          variables: { organizationHostedJobsPageName: slug },
          query: GRAPHQL_QUERY,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ashby API ${response.status}`);
      }

      const data: AshbyResponse = await response.json();
      const postings = data.data.jobBoard.jobPostings;

      return postings.map((posting) => ({
        externalId: posting.id,
        title: posting.title,
        url: posting.externalLink,
        location: posting.locationName,
        department: posting.departmentName ?? null,
        postedAt: posting.publishedDate ?? null,
        description: posting.descriptionHtml || null,
        salary: posting.compensationTierSummary || null,
      }));
    } catch (e) {
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  async fetchJobContent(slug: string, externalId: string): Promise<JobContent> {
    const url = "https://jobs.ashbyhq.com/api/non-user-graphql?op=ApiJobBoardWithTeams";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operationName: "ApiJobBoardWithTeams",
        variables: { organizationHostedJobsPageName: slug },
        query: GRAPHQL_QUERY,
      }),
    });
    if (!res.ok) return { description: null, salary: null };
    const data: AshbyResponse = await res.json();
    const posting = data.data.jobBoard.jobPostings.find((p) => p.id === externalId);
    if (!posting) return { description: null, salary: null };
    return {
      description: posting.descriptionHtml || null,
      salary: posting.compensationTierSummary || null,
    };
  }
}
