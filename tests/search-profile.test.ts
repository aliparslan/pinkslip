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
      roles: ["backend", "not-a-role", "backend"],
      target_levels: ["mid_level"],
      years_experience: 4,
      work_modes: ["hybrid", "onsite"],
      location_ids: ["new_york", "not-a-location"],
      custom_locations: ["Raleigh", "Raleigh"],
      custom_titles: ["Distributed Systems Engineer"],
      excluded_titles: ["Sales"],
    });

    expect(profile.roles).toEqual(["backend"]);
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

  test("drops product, program, and design roles from older profiles", () => {
    const profile = normalizeSearchProfile({
      roles: ["product_management", "technical_program_management", "design"],
    });

    expect(profile.roles).toEqual(DEFAULT_SEARCH_PROFILE.roles);
    expect(profile.primary_role).toBe(DEFAULT_SEARCH_PROFILE.roles[0]);
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
  test("a backend profile favors backend engineering over an unrelated role", () => {
    const prefs = scoringPrefsFromState({
      search_profile: normalizeSearchProfile({
        ...DEFAULT_SEARCH_PROFILE,
        roles: ["backend"],
        target_levels: ["early_career"],
        work_modes: ["remote"],
        location_ids: [],
      }),
      notify_threshold: 50,
    });

    const backendScore = scoreJob(job({
      title: "Backend Software Engineer",
      description: "You have 2+ years of experience building APIs.",
    }), prefs).score;
    const unrelatedScore = scoreJob(job({
      title: "Safety Operations Program Manager",
      department: "Safety",
      description: "You have 2+ years of experience operating safety programs.",
    }), prefs).score;

    expect(backendScore).toBeGreaterThanOrEqual(80);
    expect(unrelatedScore).toBeLessThan(30);
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
  test("does not classify a removed product role as a supported specialty", () => {
    const features = classifyJob(job({
      title: "Senior Product Manager, Growth",
      department: "Product",
      location: "New York, NY (Hybrid)",
      description: "You have 5+ years of product management experience.",
      salary: "$180K-$220K USD",
    }));

    expect(features.role_family).toBe("other");
    expect(features.specialties).toEqual([]);
    expect(features.seniority).toBe("manager");
    expect(features.min_years).toBe(5);
    expect(features.work_mode).toBe("hybrid");
    expect(features.metro_areas).toContain("new_york");
    expect(features.salary_min).toBe(180000);
    expect(features.confidence).toBeLessThan(0.5);
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
    expect(match.reasons).toContain("Matches your Backend focus");
    expect(match.reasons).toContain("Remote US");
    expect(match.reasons).toContain("Asks for 2+ years");
  });

  test("does not retain a role beyond the selected stretch tolerance", () => {
    const listing = job({
      title: "Backend Engineer, Devices",
      location: "Mountain View, CA",
      department: "Engineering",
      description: "This role requires at least 10 years of backend engineering experience.",
    });
    const profile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      roles: ["backend"],
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

  test("does not infer a supported engineering specialty from a broad Product department", () => {
    const listing = job({
      title: "Customer Engineer",
      department: "Product",
      location: "San Francisco, CA",
      description: "Partner with customers on technical integrations.",
    });
    const profile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      roles: ["backend"],
      target_levels: ["mid_level"],
    });
    const features = classifyJob(listing);
    const match = scoreJobForProfile("job-4", listing, features, profile);

    expect(features.specialties).not.toContain("backend");
    expect(match.plausible).toBe(false);
  });

  test("keeps principal roles out of the feed", () => {
    const listing = job({
      title: "Principal Backend Engineer",
      department: "Engineering",
      description: "Lead the long-term infrastructure strategy.",
    });
    const profile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      roles: ["backend"],
      years_experience: 4,
      target_levels: ["mid_level"],
      stretch_tolerance: "balanced",
    });
    const match = scoreJobForProfile("job-5", listing, classifyJob(listing), profile);

    expect(match.plausible).toBe(false);
  });
});

// pinkslip serves one fixed band: new grad through ~3 years. These pin both
// edges, because the previous implementation only had a ceiling.
describe("the new-grad band", () => {
  const newGradProfile = (overrides: Record<string, unknown> = {}) =>
    normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      primary_role: "backend",
      roles: ["backend"],
      work_modes: ["remote", "hybrid", "onsite"],
      ...overrides,
    });

  const scored = (title: string, description: string | null, overrides = {}) => {
    const listing = job({ title, location: "Remote - US", description });
    return scoreJobForProfile("j", listing, classifyJob(listing), newGradProfile(overrides));
  };

  test("includes a posting that states no experience requirement", () => {
    // The largest single source of supply — 401 of 685 eligible production
    // postings state no years requirement at all.
    const match = scored("Backend Engineer", "Build and operate our APIs.");
    expect(match.plausible).toBe(true);
  });

  test("includes a requirement at the ceiling and excludes one above it", () => {
    expect(scored("Backend Engineer", "At least 3 years of experience.").plausible).toBe(true);
    expect(scored("Backend Engineer", "At least 4 years of experience.").plausible).toBe(false);
  });

  test("ranks an explicit in-band requirement above an unstated one", () => {
    const stated = scored("Backend Engineer", "At least 2 years of experience.");
    const unstated = scored("Backend Engineer", "Build and operate our APIs.");
    expect(stated.breakdown.yoe_score).toBeGreaterThan(unstated.breakdown.yoe_score);
  });

  test("excludes senior, staff and internship titles", () => {
    expect(scored("Senior Backend Engineer", "Build APIs.").plausible).toBe(false);
    expect(scored("Staff Backend Engineer", "Build APIs.").plausible).toBe(false);
    expect(scored("Backend Engineer Intern", "Build APIs.").plausible).toBe(false);
  });

  test("widening target_levels cannot raise the ceiling", () => {
    // The original defect: seniority was compared against
    // Math.max(...target_levels) + allowance, so asking for senior roles
    // alongside early-career ones removed the floor and let staff+ in.
    const withSeniorSelected = scored("Member of Technical Staff", "Build APIs.", {
      target_levels: ["new_grad", "early_career", "senior", "staff_plus"],
      stretch_tolerance: "ambitious",
    });
    expect(classifyJob(job({ title: "Member of Technical Staff", location: "Remote - US", description: null })).seniority)
      .toBe("staff_plus");
    expect(withSeniorSelected.plausible).toBe(false);
  });

  test("a description mentioning senior colleagues does not exclude the job", () => {
    // Seniority must come from the title only. Reading it out of the
    // description flipped ordinary phrasing into a senior classification.
    const match = scored(
      "Backend Engineer",
      "You will work with senior engineers and lead projects end to end."
    );
    expect(match.plausible).toBe(true);
  });
});
