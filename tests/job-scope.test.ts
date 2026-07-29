import { describe, expect, it } from "bun:test";
import { classifyTitleScope, isEligibleJobListing, isTargetJobTitle } from "@worker/job-scope";

describe("job ingestion scope", () => {
  it("keeps supported technical roles and rejects removed product roles", () => {
    expect(isTargetJobTitle("Software Development Engineer II")).toBe(true);
    expect(isTargetJobTitle("Senior Product Manager, Growth")).toBe(false);
    expect(isTargetJobTitle("Staff Machine Learning Engineer")).toBe(true);
    expect(isTargetJobTitle("Principal Product Designer")).toBe(false);
    expect(isTargetJobTitle("Technical Program Manager, Infrastructure")).toBe(false);
    // Internships are out of scope entirely and are dropped at ingestion.
    expect(isTargetJobTitle("Software Engineering Intern")).toBe(false);
  });

  it("rejects people managers and executives even in technical departments", () => {
    expect(isTargetJobTitle("Engineering Manager, Platform")).toBe(false);
    expect(isTargetJobTitle("Director of Software Engineering")).toBe(false);
    expect(isTargetJobTitle("VP, Product Management")).toBe(false);
    expect(isTargetJobTitle("Head of Data Science")).toBe(false);
  });

  it("rejects clearly unsupported business and people functions", () => {
    expect(isTargetJobTitle("Senior Recruiter")).toBe(false);
    expect(isTargetJobTitle("Human Resources Representative")).toBe(false);
    expect(isTargetJobTitle("Enterprise Account Executive")).toBe(false);
    expect(isTargetJobTitle("Customer Support Engineer")).toBe(false);
    expect(isTargetJobTitle("Legal Counsel")).toBe(false);
    expect(isTargetJobTitle("Mechanical Product Engineer")).toBe(false);
    expect(isTargetJobTitle("Local Product Engineer")).toBe(false);
  });

  it("uses a specific department to rescue compact technical titles", () => {
    expect(isTargetJobTitle("Engineer II", "Software Engineering")).toBe(true);
    expect(isTargetJobTitle("Engineer II", "Manufacturing")).toBe(false);
    expect(isTargetJobTitle("Designer", "Product Design")).toBe(false);
  });

  it("requires both target scope and US eligibility", () => {
    expect(isEligibleJobListing({
      title: "Backend Engineer",
      department: "Engineering",
      location: "Remote",
      postedAt: null,
    })).toBe(true);
    expect(isEligibleJobListing({
      title: "Backend Engineer",
      department: "Engineering",
      location: "London",
      postedAt: null,
    })).toBe(false);
    expect(isEligibleJobListing({
      title: "Recruiter",
      department: "People",
      location: "Remote",
      postedAt: null,
    })).toBe(false);
  });
});

describe("classifyTitleScope", () => {
  const reason = (title: string, department?: string | null) =>
    classifyTitleScope(title, department).reason;

  it("admits titles the old allowlist structurally could not express", () => {
    // The discipline follows the head noun rather than preceding it. The old
    // allowlist only matched "software engineer" as a contiguous phrase.
    expect(classifyTitleScope("New Graduate Engineer, Software").admitted).toBe(true);
    expect(classifyTitleScope("Engineer, Software Infrastructure").admitted).toBe(true);
    expect(classifyTitleScope("Systems Engineer, Data").admitted).toBe(true);
    expect(classifyTitleScope("Solutions Engineer").admitted).toBe(true);
    expect(classifyTitleScope("Associate Solutions Engineer").admitted).toBe(true);
    expect(classifyTitleScope("Member of Technical Staff").admitted).toBe(true);
  });

  it("rejects non-software engineering disciplines", () => {
    expect(reason("New Graduate Engineer, Mechanical")).toBe("rejected_other_engineering_discipline");
    expect(reason("Propulsion Engineer (Raptor)")).toBe("rejected_other_engineering_discipline");
    expect(reason("Manufacturing Engineer, Starship")).toBe("rejected_other_engineering_discipline");
    expect(reason("Electrical Engineer")).toBe("rejected_other_engineering_discipline");
    expect(reason("Structural Engineer")).toBe("rejected_other_engineering_discipline");
  });

  it("keeps low-level software disciplines that sit next to hardware", () => {
    expect(classifyTitleScope("Embedded Software Engineer (Starlink)").admitted).toBe(true);
    expect(classifyTitleScope("Firmware Engineer").admitted).toBe(true);
  });

  it("rejects non-technical research rather than the whole research family", () => {
    expect(reason("UX Researcher")).toBe("rejected_non_technical_function");
    expect(reason("User Experience Researcher")).toBe("rejected_non_technical_function");
    expect(reason("Finance Expert - Equity Research")).toBe("rejected_non_technical_function");
    expect(reason("Research Operations Associate")).toBe("rejected_non_technical_function");
    expect(reason("Research Economist, Economic Research")).toBe("rejected_non_technical_function");

    expect(classifyTitleScope("Research Engineer, Pretraining").admitted).toBe(true);
    expect(classifyTitleScope("Research Scientist, Interpretability").admitted).toBe(true);
  });

  it("rejects roles that only borrow engineering vocabulary", () => {
    expect(reason("AI Tutor - Software Engineering Specialist")).toBe("rejected_non_technical_function");
    expect(reason("Systems Engineering Tutor")).toBe("rejected_non_technical_function");
    expect(reason("Campus Recruiter, Machine Learning")).toBe("rejected_non_technical_function");
  });

  it("reports why a title was rejected", () => {
    expect(reason("Director, Software Engineering")).toBe("rejected_management");
    expect(reason("Senior Recruiter")).toBe("rejected_non_technical_function");
    expect(reason("CNC Machinist, Thermal Development")).toBe("rejected_other_engineering_discipline");
    expect(reason("PCB Technician (Starlink)")).toBe("rejected_other_engineering_discipline");
    expect(reason("Warehouse Associate")).toBe("rejected_no_technical_signal");
  });

  it("admits trading-desk titles that hire software graduates", () => {
    expect(classifyTitleScope("Quantitative Trader").admitted).toBe(true);
    expect(classifyTitleScope("Quantitative Researcher").admitted).toBe(true);
    expect(classifyTitleScope("Quantitative Developer").admitted).toBe(true);
    expect(classifyTitleScope("Trading Systems Analyst").admitted).toBe(true);

    // Still not a route back in for the business side of a trading firm,
    // and quant framing does not rescue an internship.
    expect(classifyTitleScope("Trading Operations Manager").admitted).toBe(false);
    expect(classifyTitleScope("Equity Research Associate").admitted).toBe(false);
    expect(classifyTitleScope("Algorithmic Trading Intern").admitted).toBe(false);
  });

  it("reports why a title was admitted", () => {
    expect(reason("Backend Engineer")).toBe("admitted_technical_head_noun");
    expect(reason("Engineer II", "Software Engineering")).toBe("admitted_compact_with_department");
  });

  it("admits a globally unrecognized title when a user asked for it", () => {
    expect(classifyTitleScope("Technical Account Lead", null, []).admitted).toBe(false);
    const rescued = classifyTitleScope("Technical Account Lead", null, ["Technical Account Lead"]);
    expect(rescued.admitted).toBe(true);
    expect(rescued.reason).toBe("admitted_custom_title");
  });

  it("does not let a custom title override a management or discipline rejection", () => {
    expect(classifyTitleScope("Director of Engineering", null, ["Director of Engineering"]).admitted).toBe(false);
    expect(classifyTitleScope("Mechanical Engineer", null, ["Mechanical Engineer"]).admitted).toBe(false);
  });
});

describe("internships", () => {
  it("rejects every internship shape at ingestion", () => {
    for (const title of [
      "Software Engineering Intern",
      "Software Engineer Intern - Summer 2027",
      "Engineering Internship Program",
      "Backend Engineer, Co-op",
      "Co-Op Software Developer",
      "2027 Summer Interns - Machine Learning",
    ]) {
      const decision = classifyTitleScope(title);
      expect(decision.admitted).toBe(false);
      expect(decision.reason).toBe("rejected_internship");
    }
  });

  it("does not mistake ordinary words containing 'intern' for an internship", () => {
    expect(classifyTitleScope("Internal Tools Engineer").admitted).toBe(true);
    expect(classifyTitleScope("Software Engineer, Internationalization").admitted).toBe(true);
  });
});
