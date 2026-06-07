import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SEARCH_PROFILE,
  normalizeSearchProfile,
} from "../shared/search-profile";
import { classifyJob } from "@worker/job-features";
import { scoreJobForProfile } from "@worker/user-job-scores";
import { scoreJob } from "@worker/scoring";
import {
  preferenceStateFromRecord,
  scoringPrefsFromState,
  searchProfileFromLegacy,
} from "@worker/user-preferences";
import type { JobListing } from "@worker/adapters/types";

function job(overrides: Partial<JobListing>): JobListing {
  return {
    externalId: "job-1",
    title: "Software Engineer",
    url: "https://example.com/job-1",
    location: "Remote - US",
    department: "Engineering",
    postedAt: new Date().toISOString(),
    description: "Build useful products with a collaborative team.",
    salary: null,
    ...overrides,
  };
}

describe("search profile", () => {
  test("normalizes unknown values without losing a valid selection", () => {
    const profile = normalizeSearchProfile({
      roles: ["product_management", "not-a-role", "product_management"],
      target_levels: ["mid_level"],
      years_experience: 4,
      work_modes: ["hybrid", "onsite"],
      location_ids: ["new_york", "not-a-location"],
      custom_locations: ["Raleigh", "Raleigh"],
      custom_titles: ["Growth Product Manager"],
      excluded_titles: ["Sales"],
    });

    expect(profile.roles).toEqual(["product_management"]);
    expect(profile.target_levels).toEqual(["mid_level"]);
    expect(profile.years_experience).toBe(4);
    expect(profile.location_ids).toEqual(["new_york"]);
    expect(profile.custom_locations).toEqual(["Raleigh"]);
    expect(profile.work_modes).toEqual(["hybrid", "onsite"]);
  });

  test("converts legacy early-career software preferences", () => {
    const profile = searchProfileFromLegacy({
      role_keywords: ["software engineer", "backend", "frontend"],
      locations: ["Remote", "New York", "Chicago"],
      max_yoe: 2,
      negative_keywords: ["senior", "staff", "sales"],
    });

    expect(profile.roles).toContain("software_engineering");
    expect(profile.roles).toContain("backend");
    expect(profile.work_modes).toContain("remote");
    expect(profile.location_ids).toContain("new_york");
    expect(profile.target_levels).toEqual(["early_career"]);
    expect(profile.excluded_titles).toEqual(["sales"]);
  });

  test("uses the default profile when no prior preferences exist", () => {
    expect(preferenceStateFromRecord({}).search_profile).toEqual(DEFAULT_SEARCH_PROFILE);
  });

  test("uses an empty metro list to represent anywhere in the selected country", () => {
    const profile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      location_ids: [],
      custom_locations: [],
    });

    expect(profile.location_ids).toEqual([]);
    expect(profile.countries).toEqual(["US"]);
  });
});

describe("personalized scoring", () => {
  test("a product profile favors product management over software engineering", () => {
    const prefs = scoringPrefsFromState({
      search_profile: normalizeSearchProfile({
        ...DEFAULT_SEARCH_PROFILE,
        roles: ["product_management"],
        primary_role: "product_management",
        target_levels: ["mid_level"],
        work_modes: ["remote"],
        location_ids: [],
      }),
      notify_threshold: 50,
    });

    const productScore = scoreJob(job({
      title: "Technical Product Manager",
      department: "Product",
      description: "You have 4+ years of experience shipping technical products.",
    }), prefs).score;
    const softwareScore = scoreJob(job({
      title: "Backend Software Engineer",
      description: "You have 4+ years of experience building APIs.",
    }), prefs).score;
    const unrelatedProgramScore = scoreJob(job({
      title: "Safety Operations Program Manager",
      department: "Safety",
      description: "You have 4+ years of experience operating safety programs.",
    }), prefs).score;

    expect(productScore).toBeGreaterThanOrEqual(80);
    expect(softwareScore).toBeLessThan(30);
    expect(unrelatedProgramScore).toBeLessThan(30);
  });

  test("senior ML roles fit a senior ML profile but not an early-career profile", () => {
    const seniorProfile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      roles: ["machine_learning"],
      primary_role: "machine_learning",
      target_levels: ["senior"],
      location_ids: [],
    });
    const seniorJob = job({
      title: "Senior Machine Learning Engineer",
      department: "Machine Learning",
      description: "You have 6+ years of experience deploying ML systems.",
    });
    const seniorScore = scoreJob(
      seniorJob,
      scoringPrefsFromState({ search_profile: seniorProfile, notify_threshold: 50 })
    ).score;
    const earlyScore = scoreJob(
      seniorJob,
      scoringPrefsFromState({
        search_profile: { ...seniorProfile, target_levels: ["early_career"] },
        notify_threshold: 50,
      })
    ).score;

    expect(seniorScore).toBeGreaterThanOrEqual(80);
    expect(earlyScore).toBeLessThan(30);
  });

  test("remote jobs are filtered when remote work is not selected", () => {
    const profile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      work_modes: ["hybrid", "onsite"],
      location_ids: ["new_york"],
    });
    const result = scoreJob(
      job({ location: "Remote - US" }),
      scoringPrefsFromState({ search_profile: profile, notify_threshold: 50 })
    );

    expect(result.score).toBeLessThan(30);
    expect(result.location_score).toBe(0);
  });
});

describe("job features and match explanations", () => {
  test("classifies an obvious product role without an LLM", () => {
    const features = classifyJob(job({
      title: "Senior Product Manager, Growth",
      department: "Product",
      location: "New York, NY (Hybrid)",
      description: "You have 5+ years of product management experience.",
      salary: "$180K-$220K USD",
    }));

    expect(features.role_family).toBe("product");
    expect(features.specialties).toContain("product_management");
    expect(features.seniority).toBe("senior");
    expect(features.min_years).toBe(5);
    expect(features.work_mode).toBe("hybrid");
    expect(features.metro_areas).toContain("new_york");
    expect(features.salary_min).toBe(180000);
    expect(features.confidence).toBeGreaterThan(0.8);
  });

  test("produces readable reasons for a plausible match", () => {
    const listing = job({
      title: "Backend Engineer",
      location: "Remote - US",
      description: "At least 2 years of experience building APIs.",
    });
    const profile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      primary_role: "backend",
      roles: ["backend"],
      years_experience: 3,
      target_levels: ["early_career", "mid_level"],
      work_modes: ["remote"],
    });
    const match = scoreJobForProfile("job-1", listing, classifyJob(listing), profile);

    expect(match.plausible).toBe(true);
    expect(match.reasons).toContain("Backend role");
    expect(match.reasons).toContain("Remote US");
    expect(match.reasons).toContain("Asks for 2+ years");
  });

  test("does not retain a role beyond the selected stretch tolerance", () => {
    const listing = job({
      title: "Product Manager, Devices",
      location: "Mountain View, CA",
      department: "Product",
      description: "This role requires at least 10 years of product management experience.",
    });
    const profile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      primary_role: "product_management",
      roles: ["product_management"],
      years_experience: 4,
      target_levels: ["mid_level"],
      stretch_tolerance: "balanced",
    });
    const match = scoreJobForProfile("job-2", listing, classifyJob(listing), profile);

    expect(match.plausible).toBe(false);
    expect(match.breakdown.yoe_score).toBe(0);
    expect(match.breakdown.score).toBeLessThan(30);
  });

  test("respects an explicit no-sponsorship requirement", () => {
    const listing = job({
      title: "Backend Engineer",
      description: "Candidates must be authorized to work in the US. We cannot sponsor visas.",
    });
    const profile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      primary_role: "backend",
      roles: ["backend"],
      work_authorization: "sponsorship",
    });
    const features = classifyJob(listing);
    const match = scoreJobForProfile("job-3", listing, features, profile);

    expect(features.sponsorship_available).toBe(false);
    expect(match.plausible).toBe(false);
  });

  test("does not infer product management from a broad Product department", () => {
    const listing = job({
      title: "Customer Engineer",
      department: "Product",
      location: "San Francisco, CA",
      description: "Partner with customers on technical integrations.",
    });
    const profile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      primary_role: "product_management",
      roles: ["product_management"],
      target_levels: ["mid_level"],
    });
    const features = classifyJob(listing);
    const match = scoreJobForProfile("job-4", listing, features, profile);

    expect(features.specialties).not.toContain("product_management");
    expect(match.plausible).toBe(false);
  });

  test("keeps principal roles out of a balanced mid-level profile", () => {
    const listing = job({
      title: "Principal Product Manager",
      department: "Product",
      description: "Lead the long-term product strategy.",
    });
    const profile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      primary_role: "product_management",
      roles: ["product_management"],
      years_experience: 4,
      target_levels: ["mid_level"],
      stretch_tolerance: "balanced",
    });
    const match = scoreJobForProfile("job-5", listing, classifyJob(listing), profile);

    expect(match.plausible).toBe(false);
  });
});
