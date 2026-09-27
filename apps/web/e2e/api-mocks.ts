import type { Page, Route } from "@playwright/test";
import { createEmptyResumeProfile } from "../../../shared/resume-profile";
import {
  DEFAULT_SEARCH_PROFILE,
  ONBOARDING_VERSION,
  type SearchProfile,
} from "../../../shared/search-profile";

export const smokeJob = {
  id: "smoke-job",
  company_id: "smoke-company",
  external_id: "smoke-external-job",
  title: "Frontend Engineer",
  url: "https://example.com/jobs/frontend-engineer",
  location: "Chicago, IL · Remote",
  department: "Engineering",
  posted_at: "2026-08-25T12:00:00.000Z",
  first_seen_at: "2026-08-25T12:00:00.000Z",
  evergreen: false,
  match_fact: "Matches your frontend and early-career preferences",
  specialties: ["frontend"],
  sponsorship_available: true,
  source_type: "greenhouse",
  dismissed: 0,
  description: [
    "<h2>About the role</h2>",
    "<p>Build thoughtful, accessible product experiences with a small engineering team.</p>",
    "<h2>What you’ll do</h2>",
    "<ul><li>Ship durable web interfaces.</li><li>Partner with design and product.</li></ul>",
  ].join(""),
  salary: "$120,000–$145,000",
  closed_at: null,
  company_name: "Acme Corporation",
  company_domain: "example.com",
  ats_type: "greenhouse",
  ats_slug: "acme",
  saved: true,
  applied: false,
  content_pending: false,
  content_refresh_after_ms: null,
} as const;

const defaultSearchProfile: SearchProfile = {
  ...DEFAULT_SEARCH_PROFILE,
  onboarding_version: ONBOARDING_VERSION,
  onboarding_completed_at: "2026-08-01T12:00:00.000Z",
};

const bootstrapBase = {
  me: {
    user: {
      id: "smoke-user",
      name: "Avery Tester",
      role: "admin",
      created_at: "2026-08-01T12:00:00.000Z",
    },
    session: { state: "authenticated" },
    account: {
      authenticated: true,
      email: "avery@example.com",
      provider: "email",
      providers: ["email"],
      identity_count: 1,
    },
    is_admin: true,
    features: {
      access_required: false,
      tailoring_enabled: false,
      tailoring_provider: null,
      tailoring_model: "",
    },
  },
};

export interface ApiMockOptions {
  searchProfile?: Partial<SearchProfile>;
  onPreferencesUpdate?: (profile: SearchProfile) => void;
  onJobsRequest?: (url: URL) => void;
  jobsError?: boolean | ((url: URL) => boolean);
}

const smokeCompanies = [
  {
    id: "smoke-company",
    name: "Acme Corporation",
    ats_type: "greenhouse",
    ats_slug: "acme",
    website: "https://example.com",
    enabled: true,
    last_poll_status: "ok",
    last_poll_error: null,
    last_polled_at: "2026-09-01T11:30:00.000Z",
    poll_failure_count: 0,
    quarantined_at: null,
    blocked: false,
  },
  {
    id: "smoke-company-two",
    name: "Northstar Labs",
    ats_type: "lever",
    ats_slug: "northstar",
    website: "https://example.net",
    enabled: true,
    last_poll_status: "ok",
    last_poll_error: null,
    last_polled_at: "2026-09-01T11:20:00.000Z",
    poll_failure_count: 0,
    quarantined_at: null,
    blocked: false,
  },
] as const;

const smokeMetrics = {
  period_days: 14,
  notification_latency_seconds: 82,
  notification_open_rate: 38.4,
  notifications_sent: 126,
  apply_clicks_within_one_hour: 18,
  eligible_job_dismissal_rate: 12.5,
  users_with_enough_matches: 84,
  total_profiles: 96,
  onboarding_completion_rate: 91.7,
  accounts_created: 32,
  push_registrations: 74,
  profile_adjustments: 21,
  tailoring_to_application_rate: 46.2,
  tailoring_quality: {
    sampleSize: 20,
    unsupportedClaimRate: 0,
    onePageRate: 0.95,
    deviceFailureRate: 0.02,
    ready: true,
    insufficientSample: false,
    failedGates: [],
  },
  open_reports: 2,
  open_feedback: 3,
  events: {},
};

const resumeProfile = createEmptyResumeProfile();
resumeProfile.contact.name = "Avery Tester";
resumeProfile.contact.email = "avery@example.com";

async function json(route: Route, payload: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(payload),
  });
}

export async function installApiMocks(page: Page, options: ApiMockOptions = {}): Promise<void> {
  let searchProfile: SearchProfile = {
    ...defaultSearchProfile,
    ...options.searchProfile,
  };
  const currentBootstrap = () => ({
    ...bootstrapBase,
    preferences: { search_profile: searchProfile },
  });

  await page.route("**/api/v2/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/api\/v2/, "");

    if (path === "/logo") {
      await route.fulfill({ status: 404, body: "" });
      return;
    }
    if (path === "/bootstrap") return json(route, currentBootstrap());
    if (path === "/me") return json(route, bootstrapBase.me);
    if (path === "/preferences") {
      if (request.method() === "PUT") {
        const body = request.postDataJSON() as { search_profile?: SearchProfile };
        if (body.search_profile) {
          searchProfile = body.search_profile;
          options.onPreferencesUpdate?.(searchProfile);
        }
      }
      return json(route, { search_profile: searchProfile });
    }
    if (path === "/push/settings") {
      return json(route, {
        enabled: false,
        push_enabled: false,
        updated_at: null,
        vapid_public_key: null,
      });
    }
    if (path === "/profile") {
      return json(route, { data: resumeProfile, id: 1, updated_at: "2026-08-25T12:00:00.000Z" });
    }
    if (path === "/companies") return json(route, { companies: smokeCompanies });
    if (path === "/metrics") return json(route, smokeMetrics);
    if (path === `/tailor/${smokeJob.id}`) return json(route, { tailoring: null });
    if (path === "/stats") {
      return json(route, {
        totalJobs: 1,
        newToday: 1,
        activeCompanies: 1,
        appliedJobs: 0,
        savedJobs: 1,
        lastPolled: "2026-08-25T12:00:00.000Z",
      });
    }
    if (path === "/interactions/viewed-jobs") return json(route, { job_ids: [] });
    if (path === "/jobs/saved/list") return json(route, { jobs: [smokeJob] });
    if (path === "/jobs/applied/list") return json(route, { jobs: [] });
    if (path === `/jobs/${smokeJob.id}`) return json(route, smokeJob);
    if (path === "/jobs") {
      options.onJobsRequest?.(url);
      const jobsError = typeof options.jobsError === "function"
        ? options.jobsError(url)
        : options.jobsError;
      if (jobsError) {
        return json(route, { error: "Jobs could not be loaded." }, 503);
      }
      return json(route, {
        jobs: [smokeJob],
        meta: { total: 1, count: 1, has_more: false, next_offset: 1 },
      });
    }

    // Mutations are not exercised by smoke tests, but harmless analytics and
    // viewed-state writes should not create unrelated console or network noise.
    if (request.method() !== "GET") return json(route, {});
    return json(route, { error: `Unhandled E2E API route: ${path}` }, 501);
  });
}
