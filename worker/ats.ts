import { AshbyAdapter } from "./adapters/ashby";
import { GreenhouseAdapter } from "./adapters/greenhouse";
import { LeverAdapter } from "./adapters/lever";
import type { ATSAdapter, JobListing } from "./adapters/types";
import type { CompanyRow } from "./types";

export function getAdapter(
  atsType: CompanyRow["ats_type"]
): ATSAdapter | null {
  switch (atsType) {
    case "greenhouse":
      return new GreenhouseAdapter();
    case "lever":
      return new LeverAdapter();
    case "ashby":
      return new AshbyAdapter();
    default:
      return null;
  }
}

export async function verifyCompanySource(input: {
  ats_type: CompanyRow["ats_type"];
  ats_slug: string;
}): Promise<JobListing[]> {
  const adapter = getAdapter(input.ats_type);
  if (!adapter) {
    throw new Error(`Unsupported ATS type: ${input.ats_type}`);
  }

  return adapter.fetchJobs(input.ats_slug);
}
