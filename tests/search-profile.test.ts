import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SEARCH_PROFILE,
  ROLE_OPTIONS,
  SEARCH_PROFILE_VERSION,
  normalizeSearchProfile,
} from "../shared/search-profile";
import { classifyJob } from "@worker/job-features";
import { evaluateJobForProfile } from "@worker/user-job-matches";
import {
  preferenceStateFromRecord,
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
    expect(DEFAULT_SEARCH_PROFILE.roles).toEqual([
      "software_engineering",
      "forward_deployed",
      "frontend",
      "backend",
      "full_stack",
    ]);
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

describe("personalized eligibility", () => {
  test("a backend profile includes backend engineering and excludes an unrelated role", () => {
    const profile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      roles: ["backend"],
      target_levels: ["early_career"],
      work_modes: ["remote"],
      location_ids: [],
    });
    const backend = job({
      title: "Backend Software Engineer",
      description: "You have 2+ years of experience building APIs.",
    });
    const unrelated = job({
      title: "Safety Operations Program Manager",
      department: "Safety",
      description: "You have 2+ years of experience operating safety programs.",
    });

    expect(evaluateJobForProfile("backend", backend, classifyJob(backend), profile).plausible).toBe(true);
    expect(evaluateJobForProfile("unrelated", unrelated, classifyJob(unrelated), profile).plausible).toBe(false);
  });

  test("a deselected frontend specialty cannot return through generic SWE", () => {
    const profile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      roles: ["software_engineering"],
      location_ids: [],
    });
    const generic = job({ title: "Software Engineer" });
    const frontend = job({ title: "Frontend Software Engineer" });
    const frontendFeatures = classifyJob(frontend);

    expect(frontendFeatures.specialties).toEqual(["frontend"]);
    expect(evaluateJobForProfile("generic", generic, classifyJob(generic), profile).plausible).toBe(true);
    expect(evaluateJobForProfile("frontend", frontend, frontendFeatures, profile).plausible).toBe(false);
  });

  test("neighboring specialties are not eligible unless selected", () => {
    const profile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      roles: ["backend"],
      location_ids: [],
    });
    const infrastructure = job({ title: "Infrastructure Engineer" });

    expect(classifyJob(infrastructure).specialties).toEqual(["infrastructure"]);
    expect(evaluateJobForProfile("infra", infrastructure, classifyJob(infrastructure), profile).plausible).toBe(false);
  });

  test("keeps forward-deployed engineering independently targetable", () => {
    const listing = job({ title: "Forward Deployed Engineer" });
    const features = classifyJob(listing);
    const fdeProfile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      roles: ["forward_deployed"],
      location_ids: [],
    });
    const sweProfile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      roles: ["software_engineering"],
      location_ids: [],
    });

    expect(features.specialties).toEqual(["forward_deployed"]);
    expect(evaluateJobForProfile("fde", listing, features, fdeProfile).plausible).toBe(true);
    expect(evaluateJobForProfile("swe", listing, features, sweProfile).plausible).toBe(false);
  });

  test("migrates legacy SWE profiles to preserve their former FDE eligibility", () => {
    const profile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      version: 2,
      roles: ["software_engineering", "frontend"],
    });

    expect(profile.version).toBe(SEARCH_PROFILE_VERSION);
    expect(profile.roles).toEqual(["software_engineering", "forward_deployed", "frontend"]);
  });

  test("classifies forward-deployed software engineer titles as FDE", () => {
    const listing = job({ title: "Forward Deployed Software Engineer" });

    expect(classifyJob(listing).specialties).toEqual(["forward_deployed"]);
  });

  test("senior ML roles stay outside the product ceiling regardless of profile data", () => {
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
    expect(evaluateJobForProfile("senior", seniorJob, classifyJob(seniorJob), seniorProfile).plausible).toBe(false);
  });

  test("remote jobs are filtered when remote work is not selected", () => {
    const profile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      work_modes: ["hybrid", "onsite"],
      location_ids: ["new_york"],
    });
    const listing = job({ location: "Remote - US" });
    expect(evaluateJobForProfile("remote", listing, classifyJob(listing), profile).plausible).toBe(false);
  });

  test("location preferences are a hard eligibility gate", () => {
    const profile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      roles: ["backend"],
      location_ids: ["new_york"],
      work_modes: ["onsite"],
      relocation_willing: false,
    });
    const ny = job({
      title: "Backend Engineer",
      location: "New York, NY",
      description: "Build APIs.",
    });
    const sf = job({
      title: "Backend Engineer",
      location: "San Francisco, CA",
      description: "Build APIs.",
    });

    expect(evaluateJobForProfile("ny", ny, classifyJob(ny), profile).plausible).toBe(true);
    expect(evaluateJobForProfile("sf", sf, classifyJob(sf), profile).plausible).toBe(false);
  });

  test("open to anywhere bypasses the metro gate but not work mode", () => {
    const profile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      roles: ["backend"],
      location_ids: ["new_york"],
      work_modes: ["onsite"],
      relocation_willing: true,
    });
    const onsite = job({ title: "Backend Engineer", location: "Austin, TX" });
    const remote = job({ title: "Backend Engineer", location: "Remote" });

    expect(evaluateJobForProfile("onsite", onsite, classifyJob(onsite), profile).plausible).toBe(true);
    expect(evaluateJobForProfile("remote", remote, classifyJob(remote), profile).plausible).toBe(false);
  });
});

describe("job features and binary matches", () => {
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

  test("accepts a plausible match without producing a score", () => {
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
    const match = evaluateJobForProfile("job-1", listing, classifyJob(listing), profile);

    expect(match.plausible).toBe(true);
    expect(match).toEqual({ jobId: "job-1", plausible: true });
  });

  test("specific research titles override generic SWE", () => {
    const hybridListing = job({
      title: "Research Software Engineer",
      department: "Research",
      description: "Build evaluation systems for an applied research team.",
    });
    const researchListing = job({
      title: "Research Scientist",
      department: "Research",
      description: "Develop new model evaluation methods.",
    });
    const hybridFeatures = classifyJob(hybridListing);
    const researchFeatures = classifyJob(researchListing);
    const softwareProfile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      roles: ["software_engineering"],
      location_ids: [],
    });
    const researchProfile = normalizeSearchProfile({
      ...DEFAULT_SEARCH_PROFILE,
      roles: ["research"],
      primary_role: "research",
      location_ids: [],
    });

    expect(hybridFeatures.specialties).toEqual(["research"]);
    expect(evaluateJobForProfile("hybrid-job", hybridListing, hybridFeatures, softwareProfile).plausible).toBe(false);
    expect(evaluateJobForProfile("hybrid-job", hybridListing, hybridFeatures, researchProfile).plausible).toBe(true);
    expect(researchFeatures.specialties).toEqual(["research"]);
    expect(evaluateJobForProfile("research-job", researchListing, researchFeatures, softwareProfile).plausible).toBe(false);
    expect(evaluateJobForProfile("research-job", researchListing, researchFeatures, researchProfile).plausible).toBe(true);
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
    const match = evaluateJobForProfile("job-2", listing, classifyJob(listing), profile);

    expect(match.plausible).toBe(false);
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
    const match = evaluateJobForProfile("job-3", listing, features, profile);

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
    const match = evaluateJobForProfile("job-4", listing, features, profile);

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
    const match = evaluateJobForProfile("job-5", listing, classifyJob(listing), profile);

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

  const matched = (title: string, description: string | null, overrides = {}) => {
    const listing = job({ title, location: "Remote - US", description });
    return evaluateJobForProfile("j", listing, classifyJob(listing), newGradProfile(overrides));
  };

  test("includes a posting that states no experience requirement", () => {
    // The largest single source of supply — 401 of 685 eligible production
    // postings state no years requirement at all.
    const match = matched("Backend Engineer", "Build and operate our APIs.");
    expect(match.plausible).toBe(true);
  });

  test("does not match until the listing description has been hydrated", () => {
    expect(matched("Backend Engineer", null).plausible).toBe(false);
  });

  test("excludes numeric employer levels above the early-career band", () => {
    expect(matched("Backend Engineer 5", "Build APIs.").plausible).toBe(false);
    expect(matched("Backend Engineer L4/L5", "Build APIs.").plausible).toBe(false);
  });

  test("includes a requirement at the ceiling and excludes one above it", () => {
    expect(matched("Backend Engineer", "At least 3 years of experience.").plausible).toBe(true);
    expect(matched("Backend Engineer", "At least 4 years of experience.").plausible).toBe(false);
  });

  test("treats stated in-band and unstated requirements as binary eligibility", () => {
    expect(matched("Backend Engineer", "At least 2 years of experience.").plausible).toBe(true);
    expect(matched("Backend Engineer", "Build and operate our APIs.").plausible).toBe(true);
  });

  test("excludes senior, staff and internship titles", () => {
    expect(matched("Senior Backend Engineer", "Build APIs.").plausible).toBe(false);
    expect(matched("Staff Backend Engineer", "Build APIs.").plausible).toBe(false);
    expect(matched("Backend Engineer Intern", "Build APIs.").plausible).toBe(false);
  });

  test("widening target_levels cannot raise the ceiling", () => {
    // The original defect: seniority was compared against
    // Math.max(...target_levels) + allowance, so asking for senior roles
    // alongside early-career ones removed the floor and let staff+ in.
    const withSeniorSelected = matched("Staff Software Engineer", "Build APIs.", {
      target_levels: ["new_grad", "early_career", "senior", "staff_plus"],
      stretch_tolerance: "ambitious",
    });
    expect(classifyJob(job({ title: "Staff Software Engineer", location: "Remote - US", description: null })).seniority)
      .toBe("staff_plus");
    expect(withSeniorSelected.plausible).toBe(false);
  });

  test("a Member of Technical Staff role is not treated as staff-level", () => {
    // The frontier labs use this as their level-less IC title, so `\bstaff\b`
    // was discarding the single most relevant family of roles in the catalog.
    expect(classifyJob(job({ title: "Member of Technical Staff", location: "Remote - US", description: null })).seniority)
      .toBe("unknown");
    expect(matched("Member of Technical Staff", "Build APIs.", {
      primary_role: "software_engineering",
      roles: ["software_engineering"],
    }).plausible).toBe(true);
  });

  test("a description mentioning senior colleagues does not exclude the job", () => {
    // Seniority must come from the title only. Reading it out of the
    // description flipped ordinary phrasing into a senior classification.
    const match = matched(
      "Backend Engineer",
      "You will work with senior engineers and lead projects end to end."
    );
    expect(match.plausible).toBe(true);
  });

  test("keeps a still-listed evergreen role eligible beyond the freshness window", () => {
    const listing = job({
      title: "Backend Engineer",
      postedAt: "2024-01-01T00:00:00.000Z",
      description: "Build and operate our APIs.",
    });
    const features = classifyJob(listing);
    const profile = newGradProfile();

    expect(evaluateJobForProfile("old", listing, features, profile).plausible).toBe(false);
    expect(evaluateJobForProfile("evergreen", listing, features, profile, true).plausible).toBe(true);
  });
});
