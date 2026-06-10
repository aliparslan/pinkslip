import { AshbyAdapter } from "./adapters/ashby";
import { GreenhouseAdapter } from "./adapters/greenhouse";
import { GemAdapter } from "./adapters/gem";
import { LeverAdapter } from "./adapters/lever";
import { RipplingAdapter } from "./adapters/rippling";
import { SmartRecruitersAdapter } from "./adapters/smartrecruiters";
import { WorkdayAdapter } from "./adapters/workday";
import { YcAdapter } from "./adapters/yc";
import type { ATSAdapter, JobListing } from "./adapters/types";
import type { CompanyRow, CompanySourceType } from "./types";
import { isEligibleJobListing } from "./job-scope";

export function getAdapter(
  atsType: CompanySourceType
): ATSAdapter | null {
  switch (atsType) {
    case "greenhouse":
      return new GreenhouseAdapter();
    case "lever":
      return new LeverAdapter();
    case "ashby":
      return new AshbyAdapter();
    case "workday":
      return new WorkdayAdapter();
    case "rippling":
      return new RipplingAdapter();
    case "gem":
      return new GemAdapter();
    case "smartrecruiters":
      return new SmartRecruitersAdapter();
    case "yc":
      return new YcAdapter();
    default:
      return null;
  }
}

export function getCompanySourceType(company: Pick<CompanyRow, "ats_type" | "source_type">) {
  return company.source_type ?? company.ats_type;
}

export async function verifyCompanySource(input: {
  ats_type: CompanySourceType;
  ats_slug: string;
}): Promise<JobListing[]> {
  const adapter = getAdapter(input.ats_type);
  if (!adapter) {
    throw new Error(`Unsupported ATS type: ${input.ats_type}`);
  }

  return (await adapter.fetchJobs(input.ats_slug)).filter(isEligibleJobListing);
}
