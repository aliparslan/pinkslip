import { AshbyAdapter } from "./adapters/ashby";
import { AmazonAdapter, normalizeAmazonSource } from "./adapters/amazon";
import {
  AppleJobsAdapter,
  normalizeAppleJobsSource,
} from "./adapters/apple-jobs";
import {
  BloombergAdapter,
  normalizeBloombergSource,
} from "./adapters/bloomberg";
import {
  EightfoldAdapter,
  normalizeEightfoldSource,
} from "./adapters/eightfold";
import {
  GoogleCareersAdapter,
  normalizeGoogleCareersSource,
} from "./adapters/google";
import { GreenhouseAdapter } from "./adapters/greenhouse";
import { GemAdapter, normalizeGemSource } from "./adapters/gem";
import { LeverAdapter } from "./adapters/lever";
import { MetaAdapter, normalizeMetaSource } from "./adapters/meta";
import { TeslaAdapter, normalizeTeslaSource } from "./adapters/tesla";
import { UberAdapter, normalizeUberSource } from "./adapters/uber";
import { RipplingAdapter, normalizeRipplingSource } from "./adapters/rippling";
import {
  SmartRecruitersAdapter,
  normalizeSmartRecruitersSource,
} from "./adapters/smartrecruiters";
import { WorkdayAdapter, normalizeWorkdaySource } from "./adapters/workday";
import { YcAdapter, normalizeYcSource } from "./adapters/yc";
import type { ATSAdapter, JobListing } from "./adapters/types";
import type { CompanyRow, CompanySourceType } from "./types";
import { isPotentialCatalogJobListing } from "./job-scope";
import {
  isPollableCompanySourceType,
  type PollableCompanySourceType,
} from "../shared/company-sources";

interface CompanySourceRuntime {
  createAdapter: () => ATSAdapter;
  normalize: (raw: string) => string;
  defaultPollTier: 1 | 2;
}

function normalizeBoardToken(
  sourceType: "greenhouse" | "lever" | "ashby",
  value: string
) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${sourceType} board token is required`);
  if (/\s/.test(trimmed) || /:\/\//.test(trimmed) || trimmed.includes("/")) {
    throw new Error(`Enter just the ${sourceType} board token, not a full URL`);
  }
  return trimmed;
}

const SOURCE_RUNTIMES = {
  greenhouse: {
    createAdapter: () => new GreenhouseAdapter(),
    normalize: (raw) => normalizeBoardToken("greenhouse", raw),
    defaultPollTier: 1,
  },
  lever: {
    createAdapter: () => new LeverAdapter(),
    normalize: (raw) => normalizeBoardToken("lever", raw),
    defaultPollTier: 1,
  },
  ashby: {
    createAdapter: () => new AshbyAdapter(),
    normalize: (raw) => normalizeBoardToken("ashby", raw),
    defaultPollTier: 1,
  },
  workday: {
    createAdapter: () => new WorkdayAdapter(),
    normalize: normalizeWorkdaySource,
    defaultPollTier: 1,
  },
  rippling: {
    createAdapter: () => new RipplingAdapter(),
    normalize: normalizeRipplingSource,
    defaultPollTier: 1,
  },
  gem: {
    createAdapter: () => new GemAdapter(),
    normalize: normalizeGemSource,
    defaultPollTier: 1,
  },
  smartrecruiters: {
    createAdapter: () => new SmartRecruitersAdapter(),
    normalize: normalizeSmartRecruitersSource,
    defaultPollTier: 1,
  },
  yc: {
    createAdapter: () => new YcAdapter(),
    normalize: normalizeYcSource,
    defaultPollTier: 2,
  },
  amazon: {
    createAdapter: () => new AmazonAdapter(),
    normalize: normalizeAmazonSource,
    defaultPollTier: 2,
  },
  apple: {
    createAdapter: () => new AppleJobsAdapter(),
    normalize: normalizeAppleJobsSource,
    // Apple uses a bounded newest-first discovery scan during cron polling, so
    // it is cheap enough—and important enough for timely alerts—to run every
    // 15-minute cycle.
    defaultPollTier: 1,
  },
  google: {
    createAdapter: () => new GoogleCareersAdapter(),
    normalize: normalizeGoogleCareersSource,
    // Scheduled discovery reads only Google's newest five US pages. That keeps
    // the marquee source bounded while preserving the 15-minute alert cadence.
    defaultPollTier: 1,
  },
  meta: {
    createAdapter: () => new MetaAdapter(),
    normalize: normalizeMetaSource,
    // Discovery is one complete public sitemap plus details only for IDs that
    // are not already in D1, so Meta can stay on the 15-minute marquee cadence.
    defaultPollTier: 1,
  },
  uber: {
    createAdapter: () => new UberAdapter(),
    normalize: normalizeUberSource,
    // Uber exposes a cheap complete identity manifest; job details are only
    // requested for IDs D1 has not already resolved.
    defaultPollTier: 1,
  },
  tesla: {
    createAdapter: () => new TeslaAdapter(),
    normalize: normalizeTeslaSource,
    // Tesla's authoritative state response contains thousands of US roles, so
    // keep it in the rotating long-tail tier instead of reading it every cycle.
    defaultPollTier: 2,
  },
  bloomberg: {
    createAdapter: () => new BloombergAdapter(),
    normalize: normalizeBloombergSource,
    defaultPollTier: 2,
  },
  eightfold: {
    createAdapter: () => new EightfoldAdapter(),
    normalize: normalizeEightfoldSource,
    defaultPollTier: 2,
  },
} satisfies Record<PollableCompanySourceType, CompanySourceRuntime>;

export function getAdapter(
  atsType: unknown
): ATSAdapter | null {
  return isPollableCompanySourceType(atsType)
    ? SOURCE_RUNTIMES[atsType].createAdapter()
    : null;
}

export function normalizeCompanySource(
  sourceType: CompanySourceType,
  raw: string
): string {
  return sourceType === "custom"
    ? raw.trim()
    : SOURCE_RUNTIMES[sourceType].normalize(raw);
}

export function defaultCompanyPollTier(sourceType: CompanySourceType): 1 | 2 {
  return sourceType === "custom"
    ? 1
    : SOURCE_RUNTIMES[sourceType].defaultPollTier;
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

  return (await adapter.fetchJobs(input.ats_slug)).filter((job) =>
    isPotentialCatalogJobListing(job)
  );
}
