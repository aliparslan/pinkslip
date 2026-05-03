import type { ATSAdapter, JobListing } from "./types";

const GRAPHQL_QUERY =
  "query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) { jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) { jobPostings { id title locationName departmentName publishedDate externalLink } } }";

interface AshbyJobPosting {
  id: string;
  title: string;
  locationName: string;
  departmentName: string | null;
  publishedDate: string | null;
  externalLink: string;
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
        return [];
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
      }));
    } catch {
      return [];
    }
  }
}
