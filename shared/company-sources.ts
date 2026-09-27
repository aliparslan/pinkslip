export const POLLABLE_COMPANY_SOURCE_TYPES = [
  "greenhouse",
  "lever",
  "ashby",
  "workday",
  "rippling",
  "gem",
  "smartrecruiters",
  "yc",
  "amazon",
  "apple",
  "google",
  "meta",
  "uber",
  "tesla",
  "bloomberg",
  "eightfold",
] as const;

export type PollableCompanySourceType =
  typeof POLLABLE_COMPANY_SOURCE_TYPES[number];

export const COMPANY_SOURCE_TYPES = [
  ...POLLABLE_COMPANY_SOURCE_TYPES,
  "custom",
] as const;

export type CompanySourceType = typeof COMPANY_SOURCE_TYPES[number];

export interface CompanySourceInput {
  label: string;
  type: "text" | "url";
  placeholder: string;
}

export interface CompanySourcePresentation {
  label: string;
  input: CompanySourceInput;
  careersUrl: (slug: string) => string | null;
}

const TOKEN_INPUT: CompanySourceInput = {
  label: "ATS slug",
  type: "text",
  placeholder: "e.g. stripe",
};

export const COMPANY_SOURCE_PRESENTATION = {
  greenhouse: {
    label: "Greenhouse",
    input: TOKEN_INPUT,
    careersUrl: (slug) => `https://boards.greenhouse.io/${slug}`,
  },
  lever: {
    label: "Lever",
    input: TOKEN_INPUT,
    careersUrl: (slug) => `https://jobs.lever.co/${slug}`,
  },
  ashby: {
    label: "Ashby",
    input: TOKEN_INPUT,
    careersUrl: (slug) => `https://jobs.ashbyhq.com/${slug}`,
  },
  workday: {
    label: "Workday",
    input: {
      label: "Board URL",
      type: "url",
      placeholder: "https://company.wd5.myworkdayjobs.com/en-US/Site",
    },
    careersUrl: (slug) => slug,
  },
  rippling: {
    label: "Rippling",
    input: {
      label: "Board slug or URL",
      type: "text",
      placeholder: "e.g. pace",
    },
    careersUrl: (slug) => `https://ats.rippling.com/${slug}/jobs`,
  },
  gem: {
    label: "Gem",
    input: {
      label: "Board slug or URL",
      type: "text",
      placeholder: "e.g. gem",
    },
    careersUrl: (slug) => `https://jobs.gem.com/${slug}`,
  },
  smartrecruiters: {
    label: "SmartRecruiters",
    input: {
      label: "Company identifier or URL",
      type: "text",
      placeholder: "e.g. smartrecruiters",
    },
    careersUrl: (slug) => `https://jobs.smartrecruiters.com/${slug}`,
  },
  yc: {
    label: "Y Combinator",
    input: {
      label: "YC company slug or URL",
      type: "text",
      placeholder: "e.g. onechronos",
    },
    careersUrl: (slug) => `https://www.ycombinator.com/companies/${slug}/jobs`,
  },
  amazon: {
    label: "Amazon",
    input: {
      label: "Amazon source or URL",
      type: "text",
      placeholder: "amazon",
    },
    careersUrl: () => "https://www.amazon.jobs/en/search?country=USA",
  },
  apple: {
    label: "Apple Jobs",
    input: {
      label: "Apple source or URL",
      type: "text",
      placeholder: "apple",
    },
    careersUrl: () => "https://jobs.apple.com/en-us/search",
  },
  google: {
    label: "Google Careers",
    input: {
      label: "Google source or URL",
      type: "text",
      placeholder: "google",
    },
    careersUrl: () =>
      "https://www.google.com/about/careers/applications/jobs/results/?company=Google&location=United%20States",
  },
  meta: {
    label: "Meta Careers",
    input: {
      label: "Meta source or URL",
      type: "text",
      placeholder: "meta",
    },
    careersUrl: () => "https://www.metacareers.com/jobsearch/",
  },
  uber: {
    label: "Uber Careers",
    input: {
      label: "Uber source or URL",
      type: "text",
      placeholder: "uber",
    },
    careersUrl: () => "https://jobs.uber.com/en/jobs/",
  },
  tesla: {
    label: "Tesla Careers",
    input: {
      label: "Tesla source or URL",
      type: "text",
      placeholder: "tesla",
    },
    careersUrl: () => "https://www.tesla.com/careers/search/",
  },
  bloomberg: {
    label: "Bloomberg",
    input: {
      label: "Bloomberg source or URL",
      type: "text",
      placeholder: "bloomberg",
    },
    careersUrl: () => "https://bloomberg.avature.net/careers/SearchJobs/",
  },
  eightfold: {
    label: "Eightfold",
    input: {
      label: "Eightfold board URL",
      type: "url",
      placeholder: "https://company.eightfold.ai/careers?domain=company.com",
    },
    careersUrl: (slug) => slug,
  },
  custom: {
    label: "Custom",
    input: {
      label: "Source",
      type: "text",
      placeholder: "",
    },
    careersUrl: () => null,
  },
} satisfies Record<CompanySourceType, CompanySourcePresentation>;

const COMPANY_SOURCE_TYPE_SET = new Set<string>(COMPANY_SOURCE_TYPES);
const POLLABLE_COMPANY_SOURCE_TYPE_SET = new Set<string>(
  POLLABLE_COMPANY_SOURCE_TYPES
);

export function isCompanySourceType(value: unknown): value is CompanySourceType {
  return typeof value === "string" && COMPANY_SOURCE_TYPE_SET.has(value);
}

export function isPollableCompanySourceType(
  value: unknown
): value is PollableCompanySourceType {
  return typeof value === "string" && POLLABLE_COMPANY_SOURCE_TYPE_SET.has(value);
}

export function companySourceLabel(source: string): string {
  if (source === "All") return "All sources";
  return isCompanySourceType(source)
    ? COMPANY_SOURCE_PRESENTATION[source].label
    : source;
}

export function companySourceInput(source: string): CompanySourceInput {
  return isCompanySourceType(source)
    ? COMPANY_SOURCE_PRESENTATION[source].input
    : TOKEN_INPUT;
}

export function companyCareersUrl(source: string, slug: string): string | null {
  return isCompanySourceType(source)
    ? COMPANY_SOURCE_PRESENTATION[source].careersUrl(slug)
    : null;
}
