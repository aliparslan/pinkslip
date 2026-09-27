import { describe, it, expect } from "bun:test";
import {
  classifyJob,
  classifyReviewReasons,
  hasPotentiallyEligibleSeniority,
  parseExperienceRequirement,
  requiresAdvancedDegree,
  requiresSecurityClearance,
  upsertJobFeatures,
} from "@worker/job-features";
import type { JobListing } from "@worker/adapters/types";

describe("parseExperienceRequirement", () => {
  it("reads an explicit range", () => {
    expect(parseExperienceRequirement("Engineer", "We want 3-5 years of work")).toEqual({
      min: 3,
      max: 5,
    });
  });

  it("reads a qualified minimum", () => {
    expect(parseExperienceRequirement("Engineer", "Minimum of 4 years required")).toEqual({
      min: 4,
      max: null,
    });
    expect(parseExperienceRequirement("Engineer", "5+ years building systems")).toEqual({
      min: 5,
      max: null,
    });
    expect(parseExperienceRequirement("Engineer", "6 years of professional experience")).toEqual({
      min: 6,
      max: null,
    });
    expect(parseExperienceRequirement("Engineer", "Requires four years of experience")).toEqual({
      min: 4,
      max: null,
    });
    expect(parseExperienceRequirement(
      "Software Engineer II",
      "A bachelor's degree followed by five years of progressive, post-baccalaureate experience."
    )).toEqual({ min: 5, max: null });
  });

  it("does not promote a preferred figure into the required minimum", () => {
    expect(parseExperienceRequirement(
      "Engineer",
      "Minimum: 2+ years of experience. Preferred: 7+ years of experience."
    )).toEqual({ min: 2, max: null });
  });

  it("keeps a mandatory base when only the narrower experience is ideal", () => {
    expect(parseExperienceRequirement(
      "Resident Solutions Architect",
      "You have at least 2 years of experience with dbt, ideally including 1 year with dbt Platform."
    )).toEqual({ min: 2, max: null });
    expect(parseExperienceRequirement(
      "Resident Solutions Architect",
      "<h2>Preferred qualifications</h2><li>8+ years with data platforms.</li><h2>You are a good fit if:</h2><li>You have at least 2 years of experience with dbt, ideally including 1 year with dbt Platform.</li>"
    )).toEqual({ min: 2, max: null });
  });

  it("uses HTML list boundaries to separate optional education from a mandatory minimum", () => {
    expect(parseExperienceRequirement(
      "Quantitative Researcher",
      "<li>PhD in science or engineering strongly preferred</li><li>Minimum 5 years of experience as a quantitative researcher</li>"
    )).toEqual({ min: 5, max: null });
    expect(parseExperienceRequirement(
      "Security Engineer",
      "<h2>Preferred qualifications</h2><ul><li>8+ years in systems security, with at least 5 years focused on firmware.</li></ul>"
    )).toEqual({ min: null, max: null });
  });

  it("reads requirements split by markup and keeps the strictest minimum", () => {
    expect(parseExperienceRequirement(
      "Engineer",
      "<li>2 years of experience</li><li>5 years building distributed systems</li>"
    )).toEqual({ min: 5, max: null });
  });

  it("decodes numeric HTML entities in experience requirements", () => {
    // Production NVIDIA listings encode the plus sign this way. Leaving the
    // entity intact caused an 8-year role rated in admin to parse as 3 years.
    expect(parseExperienceRequirement(
      "Senior Site Reliability Engineer - Storage",
      "<li>3+ years building storage systems</li><li>8&#43; years of experience crafting technology solutions</li>"
    )).toEqual({ min: 8, max: null });
  });

  it("reads YOE as an experience unit", () => {
    expect(parseExperienceRequirement("Fullstack / AI Engineer (3+ YOE)", null)).toEqual({
      min: 3,
      max: null,
    });
  });

  it("does NOT treat a stray 'N years' phrase as a requirement", () => {
    // Regression: the old regex grabbed the first bare "N years" anywhere, so
    // marketing copy produced bogus experience requirements.
    expect(parseExperienceRequirement("Engineer", "We were founded 3 years ago")).toEqual({
      min: null,
      max: null,
    });
    expect(parseExperienceRequirement("Engineer", "Enjoy 10 years of free snacks")).toEqual({
      min: null,
      max: null,
    });
    expect(parseExperienceRequirement("Engineer", "Our team shipped for 7 years and counting")).toEqual({
      min: null,
      max: null,
    });
  });

  it("does not treat employer tenure as applicant experience", () => {
    expect(parseExperienceRequirement(
      "Quantitative Trader/Researcher Intern - Summer 2027",
      "We have a 25+ year track record of innovation and a reputation for discovering unique market opportunities."
    )).toEqual({ min: 0, max: 0 });
  });

  it("still recognizes early-career roles", () => {
    expect(parseExperienceRequirement("New Grad Engineer", null)).toEqual({ min: 0, max: 0 });
    expect(parseExperienceRequirement("Software Engineer (Early Career)", null)).toEqual({ min: 1, max: 3 });
  });

  it("does not read an internship mention in the body as an entry-level requirement", () => {
    // Regression: `\bintern\b` was matched against title + description, so any
    // posting that mentioned an internship programme was scored as 0 years and
    // admitted to an early-career feed regardless of its actual level.
    expect(parseExperienceRequirement(
      "Staff Software Engineer",
      "We run a great summer internship program. This role is for experienced engineers."
    )).toEqual({ min: null, max: null });

    // The title is still authoritative for genuine internships.
    expect(parseExperienceRequirement("Software Engineering Intern", null)).toEqual({ min: 0, max: 0 });
    // And explicit new-grad language in the body still counts.
    expect(parseExperienceRequirement(
      "Software Engineer",
      "This is an entry level position open to new graduates."
    )).toEqual({ min: 0, max: 0 });
  });
});

describe("advanced degree requirement", () => {
  const listing = (title: string, description: string): JobListing => ({
    externalId: "job-1",
    title,
    url: "https://example.com/job-1",
    location: "San Francisco, CA",
    department: null,
    postedAt: null,
    description,
    salary: null,
  });

  it("requires positive evidence before flagging a doctorate requirement", () => {
    const uncertain = listing(
      "Research Scientist, Gemini",
      "PhD in Computer Science, Statistics, or a related field. Strong publication record."
    );
    expect(classifyJob(uncertain).requires_advanced_degree).toBe(false);
    expect(classifyReviewReasons(uncertain, classifyJob(uncertain))).toContain("advanced_degree_uncertain");
    expect(classifyJob(listing(
      "Research Scientist",
      "Requirements: PhD degree in Computer Science, Machine Learning, or a related technical field."
    )).requires_advanced_degree).toBe(true);
  });

  it("recognizes explicit doctorate requirement grammar without negation", () => {
    const required = [
      "Must hold a Ph.D.",
      "Candidates must possess a doctorate.",
      "A doctoral degree is mandatory.",
      "DPhil required.",
      "Minimum qualifications: D.Phil required.",
      "Requirements: D. Phil. in computer science.",
      "Currently has, or is in the process of obtaining, a PhD degree in Machine Learning. Degree must be completed prior to joining.",
    ];
    for (const description of required) {
      expect(requiresAdvancedDegree(description)).toBe(true);
      expect(classifyJob(listing("Research Scientist", description)).requires_advanced_degree)
        .toBe(true);
    }

    const explicitlyAllowed = listing(
      "Research Scientist",
      "No PhD required. Demonstrated production research is what matters."
    );
    expect(requiresAdvancedDegree(explicitlyAllowed.description)).toBe(false);
    expect(classifyJob(explicitlyAllowed).requires_advanced_degree).toBe(false);
  });

  it("keeps a master's-or-doctorate attainment path eligible", () => {
    const description = "Currently has, or is in the process of obtaining, a Master's or PhD degree in Computer Science.";
    expect(requiresAdvancedDegree(description)).toBe(false);
    expect(classifyJob(listing("Research Scientist", description)).requires_advanced_degree)
      .toBe(false);
  });

  it("accepts inclusive student cohorts while excluding a PhD-only internship", () => {
    const eligibleCohorts = [
      "You must have completed your second undergraduate year. Masters and PhD students are also eligible.",
      "We are seeking exceptional Master's and PhD graduates to join the team.",
    ];
    for (const description of eligibleCohorts) {
      const job = listing("Software Engineer Intern", description);
      expect(requiresAdvancedDegree(description)).toBe(false);
      expect(classifyReviewReasons(job, classifyJob(job)))
        .not.toContain("advanced_degree_uncertain");
    }

    const phdOnly = listing(
      "Machine Learning Research Intern",
      "Your skills and experience: Pursuing a PhD in machine learning or a related field."
    );
    expect(requiresAdvancedDegree(phdOnly.description)).toBe(true);
    expect(classifyJob(phdOnly).requires_advanced_degree).toBe(true);
    expect(classifyReviewReasons(phdOnly, classifyJob(phdOnly))).toEqual([]);
  });

  it("excludes doctorate-only internship cohort wording", () => {
    const descriptions = [
      "About you: Must be working towards a PhD in computer science or mathematics.",
      "Minimum qualifications: Currently pursuing a Ph.D. or equivalent degree in Materials Science.",
      "Minimum qualifications: Currently enrolled in a Ph.D. program, or equivalent advanced degree program, in Physics.",
      "We are looking for PhD research interns with strong machine learning research experience.",
    ];

    for (const description of descriptions) {
      const job = listing("ML Research Intern", description);
      expect(requiresAdvancedDegree(description)).toBe(true);
      expect(classifyJob(job).requires_advanced_degree).toBe(true);
      expect(classifyReviewReasons(job, classifyJob(job))).toEqual([]);
    }
  });

  it("accepts bachelor's and master's abbreviations as doctorate alternatives", () => {
    const eligible = [
      "Requirements: MA or PhD required.",
      "Requirements: PhD or BEng required.",
      "Minimum qualifications: M.A. or Ph.D. in computer science.",
      "Basic qualifications: B.Eng. / D.Phil. in a related field.",
      "Required: MBA, MS, or doctorate in a quantitative field.",
    ];

    for (const description of eligible) {
      expect(requiresAdvancedDegree(description)).toBe(false);
      const job = listing("Research Scientist", description);
      expect(classifyJob(job).requires_advanced_degree).toBe(false);
      expect(classifyReviewReasons(job, classifyJob(job)))
        .not.toContain("advanced_degree_uncertain");
    }
  });

  it("does not treat mentoring doctorate learners as holding a doctorate", () => {
    const contextual = [
      "Requirements: Experience mentoring doctoral students.",
      "Minimum qualifications: Experience advising PhD candidates.",
      "Required: A track record supervising doctoral fellows.",
    ];

    for (const description of contextual) {
      expect(requiresAdvancedDegree(description)).toBe(false);
      const job = listing("Research Scientist", description);
      expect(classifyJob(job).requires_advanced_degree).toBe(false);
      expect(classifyReviewReasons(job, classifyJob(job)))
        .not.toContain("advanced_degree_uncertain");
    }

    expect(requiresAdvancedDegree(
      "Requirements: A PhD is required to mentor doctoral students."
    )).toBe(true);
  });

  it("treats a doctorate-scoped title as a requirement without description content", () => {
    expect(classifyJob(listing(
      "Data Scientist, Core Data - PhD (2026)",
      ""
    )).requires_advanced_degree).toBe(true);
    expect(classifyJob(listing(
      "PhD GenAI Research Scientist Intern",
      ""
    )).requires_advanced_degree).toBe(true);
    expect(classifyJob(listing(
      "DPhil Research Scientist",
      ""
    )).requires_advanced_degree).toBe(true);
    expect(classifyJob(listing(
      "Postdoctoral Researcher",
      ""
    )).requires_advanced_degree).toBe(true);
  });

  it("does not flag a hedged or optional doctorate", () => {
    expect(classifyJob(listing(
      "Research Engineer, Pre-training",
      "Degree (BA required, MS or PhD preferred) in Computer Science or a related field."
    )).requires_advanced_degree).toBe(false);
    expect(classifyJob(listing(
      "Research Scientist, Gemini Safety",
      "PhD in Computer Science, a related field, or equivalent practical experience."
    )).requires_advanced_degree).toBe(false);
    expect(classifyJob(listing(
      "Software Engineer, Product",
      "Strong programming skills in Python. A PhD is a plus."
    )).requires_advanced_degree).toBe(false);
  });

  it("leaves ordinary postings unflagged", () => {
    expect(classifyJob(listing(
      "Backend Engineer",
      "You will build APIs. Bachelor's degree or equivalent experience."
    )).requires_advanced_degree).toBe(false);
    const contextual = listing(
      "Software Engineer, Research Platform",
      "Collaborate with PhD scientists to build reliable research tooling."
    );
    expect(classifyJob(contextual).requires_advanced_degree).toBe(false);
    expect(classifyReviewReasons(contextual, classifyJob(contextual))).not.toContain("advanced_degree_uncertain");
  });

  it("does not queue optional, lower-degree-alternative, or acronym mentions", () => {
    const examples = [
      listing(
        "Antenna Engineer",
        "Preferred skills and experience: Master’s degree or PhD in electrical engineering."
      ),
      listing(
        "Data Scientist",
        "Bachelor’s, Master’s, or PhD in a quantitative field; or equivalent practical experience."
      ),
      listing(
        "Research Engineer",
        "B.S., M.S., or PhD degree in Computer Science or a related field."
      ),
      listing(
        "Tracking Software Engineer",
        "Implement multi-target tracking algorithms such as JPDA, MHT, or PHD filters."
      ),
      listing(
        "Research Engineer",
        "PhD in machine learning or equivalent industry experience."
      ),
      listing(
        "Systems Research Engineer",
        "&lt;li&gt;Bachelor's, Master's, or Ph.D. in computer science or equivalent practical experience&lt;/li&gt;"
      ),
      listing(
        "Machine Learning Engineer",
        "2+ years of experience as a machine learning engineer or a PhD in a relevant field."
      ),
      listing(
        "Research Engineer",
        "PhD in machine learning or 3 years of industry experience."
      ),
      listing(
        "Research Scientist",
        "PhD or equivalent research depth in machine learning."
      ),
      listing(
        "Researcher",
        "Hold a PhD or have research experience in machine learning."
      ),
    ];
    const unexpectedlyUncertain = examples
      .filter((example) => classifyReviewReasons(example, classifyJob(example)).includes("advanced_degree_uncertain"))
      .map((example) => example.description);
    expect(unexpectedlyUncertain).toEqual([]);
  });

  it("does not treat biographies, audiences, or explicit non-requirements as applicant gates", () => {
    const contextualExamples = [
      listing(
        "Forward Deployed Engineer",
        "The company was founded by Jane Doe, who did a math PhD at MIT. Build customer systems."
      ),
      listing(
        "Product Engineer",
        "We serve researchers globally, from PhD students to academic professionals."
      ),
      listing(
        "AI Researcher",
        "A PhD is neither necessary nor sufficient; production research experience matters."
      ),
      listing(
        "AI Research Fellow",
        "PhD candidates, recent graduates, or independent researchers with equivalent demonstrated output may apply."
      ),
    ];
    for (const example of contextualExamples) {
      expect(classifyReviewReasons(example, classifyJob(example))).not.toContain("advanced_degree_uncertain");
    }

    const biographyAndRequirement = listing(
      "Founding Computational Scientist",
      "Founded by Jane Doe, PhD. Applicants must have a PhD in computational biology."
    );
    expect(classifyReviewReasons(
      biographyAndRequirement,
      classifyJob(biographyAndRequirement)
    )).toEqual([]);
    expect(classifyJob(biographyAndRequirement).requires_advanced_degree).toBe(true);
  });

  it("treats a master's as eligible, including master's-or-doctorate requirements", () => {
    const eligibleExamples = [
      listing(
        "Machine Learning Engineer",
        "Requirements: Master's degree in computer science or a related field."
      ),
      listing(
        "Software Engineer",
        "Minimum qualifications: Bachelor's or Master's degree in computer science."
      ),
      listing(
        "Machine Learning Researcher",
        "Requirements: PhD or Master’s in computer science or a related field."
      ),
      listing(
        "Applied Scientist",
        "Minimum qualifications: Master's degree or PhD in machine learning."
      ),
      listing(
        "Research Engineer",
        "Required: M.S. / Ph.D. in computer science."
      ),
    ];

    for (const example of eligibleExamples) {
      expect(classifyJob(example).requires_advanced_degree).toBe(false);
      expect(classifyReviewReasons(example, classifyJob(example))).not.toContain("advanced_degree_uncertain");
    }

    const doctorateOnly = listing(
      "Research Scientist",
      "Requirements: PhD in computer science or a related field."
    );
    expect(classifyJob(doctorateOnly).requires_advanced_degree).toBe(true);
    expect(classifyReviewReasons(doctorateOnly, classifyJob(doctorateOnly))).toEqual([]);

    const separatelyPreferredMasters = listing(
      "Research Scientist",
      "Master's degree preferred. Applicants must have a PhD in computer science."
    );
    expect(classifyJob(separatelyPreferredMasters).requires_advanced_degree).toBe(true);
    expect(classifyReviewReasons(
      separatelyPreferredMasters,
      classifyJob(separatelyPreferredMasters)
    )).toEqual([]);
  });

  it("preserves punctuation-free basic and preferred qualification sections", () => {
    expect(requiresAdvancedDegree(
      "<h2>Basic qualifications</h2><ul><li>PhD in computer science</li></ul>"
      + "<h2>Preferred qualifications</h2><ul><li>Distributed systems experience</li></ul>"
    )).toBe(true);

    expect(requiresAdvancedDegree(
      "<h2>Basic qualifications</h2><ul><li>Master's degree or PhD in computer science</li></ul>"
      + "<h2>Preferred qualifications</h2><ul><li>Publication record</li></ul>"
    )).toBe(false);

    expect(requiresAdvancedDegree(
      "<h2>Basic qualifications</h2><ul><li>Production software experience</li></ul>"
      + "<h2>Preferred qualifications</h2><ul><li>PhD in computer science</li></ul>"
    )).toBe(false);
  });

  it("accepts a concrete experience path instead of a doctorate", () => {
    expect(requiresAdvancedDegree(
      "Requirements: PhD in machine learning or 3 years of industry experience."
    )).toBe(false);
    expect(requiresAdvancedDegree(
      "Qualifications: Hold a PhD or have research experience in machine learning."
    )).toBe(false);
    expect(requiresAdvancedDegree(
      "Requirements: 4 years of relevant experience or a PhD in computer science."
    )).toBe(false);
  });
});

describe("security clearance requirement", () => {
  const listing = (description: string, title = "Software Engineer"): JobListing => ({
    externalId: "clearance-job",
    title,
    url: "https://example.com/clearance-job",
    location: "Remote - US",
    department: "Engineering",
    postedAt: null,
    description,
    salary: null,
  });

  it("flags current clearances and requirements to obtain one", () => {
    const required = [
      "<h2>Basic qualifications</h2><ul><li>Active TS/SCI security clearance with polygraph</li></ul>",
      "Requirements: Candidates must possess and maintain a Secret clearance.",
      "You must be able to obtain and maintain a U.S. Government security clearance.",
      "Applicants must be eligible for a Top Secret clearance.",
      "Minimum qualifications: eligibility to obtain a security clearance.",
      "This role requires access to classified information.",
      "A security clearance is not required to start, but must obtain one within six months.",
    ];

    for (const description of required) {
      expect(requiresSecurityClearance(description)).toBe(true);
      expect(classifyJob(listing(description)).requires_security_clearance).toBe(true);
    }
  });

  it("does not turn optional, negated, or contextual mentions into requirements", () => {
    const allowed = [
      "No security clearance is required.",
      "This role does not require a security clearance.",
      "Clearance: none.",
      "An active Secret clearance is preferred, not required.",
      "<h2>Preferred qualifications</h2><ul><li>Active TS/SCI clearance</li></ul>",
      "Collaborate with colleagues who hold security clearances.",
      "Experience with AWS Secrets Manager and encrypted configuration.",
      "Must pass a standard employment background check.",
      "U.S. citizenship is required under ITAR export-control rules.",
    ];

    for (const description of allowed) {
      expect(requiresSecurityClearance(description)).toBe(false);
      expect(classifyJob(listing(description)).requires_security_clearance).toBe(false);
    }
  });

  it("keeps Public Trust distinct from a security clearance", () => {
    expect(requiresSecurityClearance(
      "Minimum qualifications: ability to obtain a Public Trust designation."
    )).toBe(false);
    expect(requiresSecurityClearance(
      "Requirements: Public Trust or Secret clearance."
    )).toBe(false);
    expect(requiresSecurityClearance(
      "Requirements: Secret clearance or Public Trust suitability."
    )).toBe(false);
    expect(requiresSecurityClearance(
      "Requirements: Public Trust suitability and an active Secret clearance."
    )).toBe(true);
  });

  it("treats a clearance-scoped public title as deterministic", () => {
    const job = listing("Build reliable services.", "Software Engineer (TS/SCI)");
    expect(classifyJob(job).requires_security_clearance).toBe(true);
    expect(classifyReviewReasons(job, classifyJob(job))).toEqual([]);
  });
});

describe("classifier review reasons", () => {
  it("queues ambiguous employer title levels", () => {
    const listing: JobListing = {
      externalId: "level-3",
      title: "Software Engineer III",
      url: "https://example.com/level-3",
      location: "Remote - US",
      department: "Engineering",
      postedAt: null,
      description: "Build reliable products.",
      salary: null,
    };
    expect(classifyReviewReasons(listing, classifyJob(listing))).toContain("ambiguous_title_level");
  });

  it("does not queue uncertainty for a job already outside the catalog", () => {
    const listing: JobListing = {
      externalId: "senior-phd",
      title: "Senior Machine Learning Engineer",
      url: "https://example.com/senior-phd",
      location: "Remote - US",
      department: "Engineering",
      postedAt: null,
      description: "PhD in Computer Science or a related field. 8&#43; years of experience required.",
      salary: null,
    };
    expect(classifyReviewReasons(listing, classifyJob(listing))).toEqual([]);
  });

  it("does not queue deterministic degree exclusions or fixed-term durations", () => {
    const postdoc: JobListing = {
      externalId: "postdoc",
      title: "Post-Doctoral AI Researcher (2 year Fixed-Term)",
      url: "https://example.com/postdoc",
      location: "Remote - US",
      department: "Research",
      postedAt: null,
      description: "This position is designed for recent PhD graduates.",
      salary: null,
    };
    expect(classifyJob(postdoc).requires_advanced_degree).toBe(true);
    expect(classifyReviewReasons(postdoc, classifyJob(postdoc))).toEqual([]);

    const fixedTerm = { ...postdoc, title: "AI Researcher (2 year Fixed-Term)", description: "Research models." };
    expect(classifyReviewReasons(fixedTerm, classifyJob(fixedTerm))).not.toContain("ambiguous_title_level");
  });

  it("does not re-queue experience phrases the parser intentionally treats as optional", () => {
    const optional: JobListing = {
      externalId: "optional-experience",
      title: "Security Engineer",
      url: "https://example.com/optional-experience",
      location: "Remote - US",
      department: "Engineering",
      postedAt: null,
      description: "Preferred qualifications: 8+ years in systems security, with at least 5 years focused on firmware.",
      salary: null,
    };
    expect(classifyJob(optional).min_years).toBeNull();
    expect(classifyReviewReasons(optional, classifyJob(optional))).not.toContain("experience_requirement_unparsed");
  });
});

describe("review queue reconciliation", () => {
  function recordingDb() {
    const statements: string[] = [];
    const db = {
      prepare(sql: string) {
        statements.push(sql);
        const prepared = {
          bind() {
            return prepared;
          },
        };
        return prepared;
      },
      async batch() {
        return [];
      },
    } as unknown as D1Database;
    return { db, statements };
  }

  const listing = (title: string, description: string): JobListing => ({
    externalId: "review-job",
    title,
    url: "https://example.com/review-job",
    location: "Remote - US",
    department: "Engineering",
    postedAt: null,
    description,
    salary: null,
  });

  it("deletes only pending rows when a newer classifier resolves the ambiguity", async () => {
    const { db, statements } = recordingDb();
    await upsertJobFeatures(db, [{
      jobId: "review-job",
      listing: listing("Backend Engineer", "Build reliable APIs."),
    }]);

    const deletion = statements.find((sql) => sql.includes("DELETE FROM job_review_queue"));
    expect(deletion).toContain("state = 'needs_review'");
  });

  it("does not reopen an unchanged human label solely for a classifier version bump", async () => {
    const { db, statements } = recordingDb();
    await upsertJobFeatures(db, [{
      jobId: "review-job",
      listing: listing("Software Engineer III", "Build reliable APIs."),
    }]);

    const upsert = statements.find((sql) => sql.includes("INSERT INTO job_review_queue"));
    expect(upsert).toContain("job_review_queue.reason_codes_json != excluded.reason_codes_json");
    expect(upsert).toContain("job_review_queue.evidence_json != excluded.evidence_json");
    expect(upsert).toContain("job_review_queue.classifier_version = excluded.classifier_version");
    expect(upsert).not.toContain("job_review_queue.classifier_version != excluded.classifier_version");
  });
});

describe("classifyJob", () => {
  const listing = (title: string, description: string | null = null): JobListing => ({
    externalId: "job-1",
    title,
    url: "https://example.com/job-1",
    location: "Remote - US",
    department: "Program Management",
    postedAt: null,
    description,
    salary: null,
  });

  it("treats removed program-management titles as management", () => {
    expect(classifyJob(listing("Technical Program Manager")).seniority).toBe("manager");
    expect(classifyJob(listing("Technical Program Manager", "2+ years of experience"))).toMatchObject({
      seniority: "manager",
      min_years: 2,
    });
  });

  it("still classifies engineering managers as managers", () => {
    expect(classifyJob(listing("Engineering Manager")).seniority).toBe("manager");
  });

  it("treats employer numeric levels four and above as senior", () => {
    expect(classifyJob(listing("Software Engineer 5")).seniority).toBe("senior");
    expect(classifyJob(listing("Data Engineer (L5) - Privacy")).seniority).toBe("senior");
    expect(classifyJob(listing("ML Engineer L4/L5, Algorithms")).seniority).toBe("senior");
    expect(classifyJob(listing("Software Engineer, iOS, Level 5")).seniority).toBe("senior");
    expect(classifyJob(listing("Software Engineer II")).seniority).toBe("early_career");
  });

  it("exposes the same title-only eligibility guard for memory-conscious adapters", () => {
    expect(hasPotentiallyEligibleSeniority("Software Engineer II")).toBe(true);
    expect(hasPotentiallyEligibleSeniority("Staff Engineer, New Grad Program")).toBe(false);
    expect(hasPotentiallyEligibleSeniority("Senior Software Engineer")).toBe(false);
    expect(hasPotentiallyEligibleSeniority("Principal Applied Scientist")).toBe(false);
    expect(hasPotentiallyEligibleSeniority(
      "Compiler Engineer, MTIA Software (Technical Leadership)"
    )).toBe(false);
  });

  it("does not read 'Member of Technical Staff' as a staff-level role", () => {
    // Regression: `\bstaff\b` matched the level-less IC title used across the
    // frontier labs, discarding all 43 such postings in the historical corpus.
    expect(classifyJob(listing("Member of Technical Staff")).seniority).toBe("early_career");
    expect(classifyJob(listing("Member of Technical Staff - Ads")).seniority).toBe("early_career");
    expect(classifyJob(listing("Member of Technical Staff (KV)")).seniority).toBe("early_career");
    expect(classifyJob(listing("Technical Staff, Frontend")).seniority).toBe("early_career");

    // Genuine staff-level titles are unaffected.
    expect(classifyJob(listing("Staff Software Engineer")).seniority).toBe("staff_plus");
    expect(classifyJob(listing("Principal Engineer, Platform")).seniority).toBe("staff_plus");
    // And a senior marker still wins inside the MoTS family.
    expect(classifyJob(listing("Senior Member of Technical Staff")).seniority).toBe("senior");
  });

  it("applies career-stage precedence without admitting explicit staff roles", () => {
    expect(classifyJob(listing("Member of Technical Staff (Early Career)")).seniority).toBe("early_career");
    expect(classifyJob(listing("Staff Engineer, New Grad Program")).seniority).toBe("staff_plus");
    expect(classifyJob(listing("Software Engineering Intern")).seniority).toBe("internship");
  });

  it("separates internship, new-grad, early-career, and above-band signals", () => {
    expect(classifyJob(listing("Backend Engineering Apprentice")).seniority).toBe("internship");
    expect(classifyJob(listing("NVIDIA 2027 Internships: Software Engineering")).seniority).toBe("internship");
    expect(classifyJob(listing("Security Apprenticeships - 2027")).seniority).toBe("internship");
    expect(classifyJob(listing("Graduate Software Engineer")).seniority).toBe("new_grad");
    expect(classifyJob(listing("New College Grad - AI Research Engineer")).seniority).toBe("new_grad");
    expect(classifyJob(listing(
      "Software Engineer",
      "Applicants must graduate between December 2026 and June 2027."
    )).seniority).toBe("new_grad");
    expect(classifyJob(listing(
      "Software Engineer",
      "Candidates must be graduating May 2027."
    )).seniority).toBe("new_grad");
    expect(classifyJob(listing(
      "Software Engineer",
      "Required graduation date: May 2027."
    )).seniority).toBe("new_grad");
    expect(classifyJob(listing(
      "Software Engineer",
      "0 years of professional experience required."
    )).seniority).toBe("new_grad");
    expect(classifyJob(listing("Associate Software Engineer")).seniority).toBe("early_career");
    expect(classifyJob(listing("Software Engineer", "3 years of relevant experience.")).seniority).toBe("early_career");
    expect(classifyJob(listing("Software Engineer", "4 years of relevant experience.")).seniority).toBe("mid_level");
  });

  it("recognizes role-defining internship copy without reading incidental programs", () => {
    expect(classifyJob(listing(
      "Software Engineer",
      "This is an internship position on our developer platform team."
    )).seniority).toBe("internship");
    expect(classifyJob(listing(
      "Software Engineer",
      "This role is a co-op with our infrastructure group."
    )).seniority).toBe("internship");
    expect(classifyJob(listing(
      "Software Engineer",
      "We are seeking an intern to build developer tools."
    )).seniority).toBe("internship");
    expect(classifyJob(listing(
      "Software Engineer",
      "We are seeking a software engineering intern to join the team."
    )).seniority).toBe("internship");
    expect(classifyJob(listing(
      "Software Engineer",
      "As an intern, you will ship production software with the team."
    )).seniority).toBe("internship");
    expect(classifyJob(listing(
      "Software Engineer",
      "This internship/co-op position works on our infrastructure platform."
    )).seniority).toBe("internship");
    expect(classifyJob(listing(
      "Software Engineer",
      "We are hiring an apprentice for the security engineering group."
    )).seniority).toBe("internship");
    expect(classifyJob(listing(
      "Software Engineer",
      "We run a summer internship program for students across the company."
    )).seniority).toBe("early_career");
    expect(classifyJob(listing(
      "Software Engineer",
      "We are seeking software engineers with internship experience."
    )).seniority).toBe("early_career");
    expect(classifyJob(listing(
      "Software Engineer",
      "We are seeking support for our internship program."
    )).seniority).toBe("early_career");
    expect(classifyJob(listing(
      "Software Engineer",
      "This is not an internship position."
    )).seniority).toBe("early_career");
  });

  it("maps shorthand internship disciplines to selectable role specialties", () => {
    const cases = [
      ["Engineering Intern", "software_engineering"],
      ["Forward Deployed Engineering Intern", "forward_deployed"],
      ["UI Intern", "frontend"],
      ["Backend Intern", "backend"],
      ["Full Stack Intern", "full_stack"],
      ["iOS Intern", "mobile"],
      ["Data Engineering Intern", "data_engineering"],
      ["Machine Learning Intern", "machine_learning"],
      ["Data Scientist Intern", "machine_learning"],
      ["Research Intern", "research"],
      ["Applied Scientist Intern", "research"],
      ["DevOps Intern", "infrastructure"],
      ["Cybersecurity Intern", "security"],
    ] as const;

    for (const [title, specialty] of cases) {
      const features = classifyJob(listing(title));
      expect(features.seniority).toBe("internship");
      expect(features.specialties).toContain(specialty);
    }
  });

  it("does not turn a preferred graduation window into a new-grad gate", () => {
    expect(classifyJob(listing(
      "Software Engineer",
      "Preferred qualifications: Graduation date between December 2026 and June 2027."
    )).seniority).toBe("early_career");
    expect(classifyJob(listing(
      "Software Engineer",
      "Required qualifications: Graduation date between December 2026 and June 2027."
    )).seniority).toBe("new_grad");
    expect(classifyJob(listing(
      "Software Engineer",
      "Qualifications: Graduation date may vary by program."
    )).seniority).toBe("early_career");
    expect(classifyJob(listing(
      "Software Engineer",
      "Candidates must be a graduate and may work remotely."
    )).seniority).toBe("early_career");
  });

  it("does not classify negated new-grad wording as new-grad", () => {
    expect(parseExperienceRequirement(
      "Software Engineer",
      "This is not an entry-level position."
    )).toEqual({ min: null, max: null });
    expect(classifyJob(listing(
      "Software Engineer",
      "This is not an entry-level position."
    )).seniority).toBe("early_career");
    expect(classifyJob(listing(
      "Software Engineer",
      "New graduates are not eligible for this role."
    )).seniority).toBe("early_career");
  });

  it("keeps title degree alternatives eligible while excluding PhD-only titles", () => {
    const alternative = classifyJob(listing(
      "2027 Graduate Software Engineer (BS/MS/PhD)"
    ));
    expect(alternative.seniority).toBe("new_grad");
    expect(alternative.requires_advanced_degree).toBe(false);
    expect(classifyJob(listing(
      "Research Engineer (Master's or PhD)"
    )).requires_advanced_degree).toBe(false);
    expect(classifyJob(listing(
      "Research Scientist - PhD preferred"
    )).requires_advanced_degree).toBe(false);
    expect(classifyJob(listing("Data Scientist - PhD")).requires_advanced_degree)
      .toBe(true);
  });
});
