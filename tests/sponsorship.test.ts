import { describe, expect, it } from "bun:test";
import { classifyJob } from "@worker/job-features";
import { legacySponsorshipStatement, sponsorshipStatement, WIDER_SPONSORSHIP_PATTERNS } from "@worker/sponsorship";

describe("sponsorshipStatement", () => {
  it("reads the ways a posting says it won't sponsor", () => {
    for (const text of [
      "Visa sponsorship is not offered for this role.",
      "We are unable to provide visa sponsorship for this position at this time.",
      "We're not able to sponsor visas right now.",
      "Acme will not sponsor a new applicant for employment authorization for this position.",
      "Acme is not sponsoring employment visas for this role.",
      "We do not offer any type of employment-based immigration sponsorship for this role.",
      "This role does not offer visa sponsorship .",
      "This position is not eligible for employment-based sponsorship.",
      "It is not available for any work sponsorship.",
      "No visa sponsorship is available for this position.",
      "Current and future sponsorship are not available for this position.",
      "Sponsorship of new applicants for employment authorization, or any other immigration-related support, is not available.",
      "The company will not pursue visa sponsorship for these positions.",
    ]) expect(sponsorshipStatement(text)).toBe(false);
  });

  it("reads the applicant's side of the same thing", () => {
    for (const text of [
      "You must be authorized to work in the U.S. without the need for employer sponsorship.",
      "Applicants must be authorized to work in the United States without requiring current or future visa sponsorship (e.g. H-1B).",
      "Candidates must be authorised to work in the US without current or future employer-sponsored visa support.",
      "Does not require sponsorship for employment visa status (now or in the future).",
      "Legal authorization to work in the United States and will not require visa sponsorship now or in the future.",
      "Acme is unable to consider applicants who would require current or future sponsorship for employment authorization.",
    ]) expect(sponsorshipStatement(text)).toBe(false);
  });

  it("reads through markup and a sentence that starts 'All candidates'", () => {
    expect(sponsorshipStatement(
      "<p>All candidates must be legally authorized to&nbsp;<span>work in the United States without requiring current or future employer sponsorship.</span></p>",
    )).toBe(false);
  });

  it("reads the ways a posting says it sponsors", () => {
    for (const text of [
      "Visa sponsorship: We do sponsor visas!",
      "We sponsor H1B, O1, EB1 and STEM OPT.",
      "We're happy to sponsor international candidates (e.g., STEM OPT, H1B).",
      "Acme will consider sponsoring a new qualified applicant for employment authorization for this position.",
      "Visa sponsorship is available for this position.",
      "We offer visa sponsorship and will help you relocate.",
      "Relocation support and visa sponsorship where applicable",
      "Visa sponsorship and green card support for qualified candidates.",
      "Visa Sponsorship : We provide support for relocation and visas.",
    ]) expect(sponsorshipStatement(text)).toBe(true);
  });

  it("keeps a yes when the posting adds that it can't promise every case", () => {
    expect(sponsorshipStatement(
      "We do sponsor visas! However, we aren't able to successfully sponsor visas for every role and every candidate.",
    )).toBe(true);
  });

  it("says nothing when the no only covers part of the ground", () => {
    for (const text of [
      "We are unable to sponsor an employment visa for roles outside of engineering and product.",
      "We are able to support H-1B employer transfers but are NOT able to provide new visa sponsorship.",
      "Open to candidates with active H-1B status requiring a change-of-employer transfer. We do not sponsor new H-1B lottery filings.",
      "This position is generally not eligible for new visa sponsorship. The business may sponsor existing visa transfers.",
      "Remote roles are not eligible for U.S. visa sponsorship.",
      "Visa sponsorship is available for this position. We are unable to sponsor visas.",
    ]) expect(sponsorshipStatement(text)).toBeNull();
  });

  it("says nothing for a maybe, a question, or a plain work-authorization line", () => {
    for (const text of [
      "Acme may provide visa sponsorship for certain positions.",
      "Visa sponsorship may be available for this position depending on business considerations.",
      "Will you now or in the future require visa sponsorship?",
      "Must be authorized to work in the United States.",
      "Visa Sponsorship",
      null,
    ]) expect(sponsorshipStatement(text)).toBeNull();
  });

  it("ignores sponsored perks, products, people and export licences", () => {
    for (const text of [
      "Company-sponsored 401(k) and team events.",
      "The Sponsored Products team is changing advertising.",
      "An executive sponsor on the customer's side from day one.",
      "Tuition reimbursement, conference and training sponsorship.",
      "In partnership with our sponsor banks, we offer credit cards.",
      "Companies like Stripe and Visa trust us.",
      "Any offer may be conditioned on your authorization to receive technology controlled under U.S. export laws without sponsorship for an export license.",
    ]) expect(sponsorshipStatement(text)).toBeNull();
  });
});

describe("the sponsorship switch", () => {
  const listing = (description: string) => ({
    externalId: "1", title: "Software Engineer", url: "https://example.com", location: "New York, NY",
    department: null, postedAt: null, description, salary: null,
  });

  it("keeps the original patterns' answers where they had one", () => {
    expect(legacySponsorshipStatement("We are unable to sponsor visas.")).toBe(false);
    expect(legacySponsorshipStatement("Visa sponsorship is available.")).toBe(true);
    expect(legacySponsorshipStatement("Visa sponsorship is not offered for this role.")).toBeNull();
  });

  it("stores the wider reading only once it is switched on", () => {
    const stored = classifyJob(listing("Visa sponsorship is not offered for this role.")).sponsorship_available;
    expect(stored).toBe(WIDER_SPONSORSHIP_PATTERNS ? false : null);
  });
});
