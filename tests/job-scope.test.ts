import { describe, expect, it } from "bun:test";
import {
  classifyTitleScope,
  hasDisqualifyingJobRequirement,
  isEligibleJobListing,
  isPotentialCatalogJobListing,
  isTargetJobTitle,
} from "@worker/job-scope";

describe("job ingestion scope", () => {
  it("keeps supported technical roles and rejects removed product roles", () => {
    expect(isTargetJobTitle("Software Development Engineer II")).toBe(true);
    expect(isTargetJobTitle("Senior Product Manager, Growth")).toBe(false);
    expect(isTargetJobTitle("Staff Machine Learning Engineer")).toBe(true);
    expect(isTargetJobTitle("Principal Product Designer")).toBe(false);
    expect(isTargetJobTitle("Technical Program Manager, Infrastructure")).toBe(false);
    expect(isTargetJobTitle("Software Engineering Intern")).toBe(true);
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

  it("does not hydrate titles already outside the fixed seniority band", () => {
    const listing = {
      department: "Software Development",
      location: "Seattle, WA, USA",
      postedAt: null,
    };
    expect(isPotentialCatalogJobListing({
      ...listing,
      title: "Software Development Engineer II",
    })).toBe(true);
    expect(isPotentialCatalogJobListing({
      ...listing,
      title: "Senior Software Development Engineer",
    })).toBe(true);
    expect(isPotentialCatalogJobListing({
      ...listing,
      title: "Principal Applied Scientist",
    })).toBe(false);
  });

  it("drops fixed-audience requirements only when they are actual gates", () => {
    const listing = {
      title: "Machine Learning Engineer",
      department: "Machine Learning",
      location: "Seattle, WA, USA",
      postedAt: null,
    };

    expect(isPotentialCatalogJobListing({
      ...listing,
      description: "<h2>Basic qualifications</h2><li>PhD in computer science</li>",
    })).toBe(true);
    expect(isPotentialCatalogJobListing({
      ...listing,
      description: "<h2>Basic qualifications</h2><li>Master's degree or PhD in computer science</li>",
    })).toBe(true);
    expect(isPotentialCatalogJobListing({
      ...listing,
      description: "<h2>Preferred qualifications</h2><li>PhD in computer science</li>",
    })).toBe(true);

    expect(hasDisqualifyingJobRequirement({
      title: "2027 Graduate Software Engineer (BS/MS/PhD)",
    })).toBe(false);
    expect(hasDisqualifyingJobRequirement({
      title: "Data Scientist - PhD",
    })).toBe(false);

    expect(hasDisqualifyingJobRequirement({
      title: "Software Engineer",
      description: "Must be able to obtain and maintain a security clearance.",
    })).toBe(true);
    expect(hasDisqualifyingJobRequirement({
      title: "Software Engineer",
      description: "An active Secret clearance is preferred.",
    })).toBe(false);
    expect(hasDisqualifyingJobRequirement({
      title: "Software Engineer (TS/SCI)",
    })).toBe(true);
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
    expect(reason("Hardware Research Engineer, Robotics Studio"))
      .toBe("rejected_other_engineering_discipline");
    expect(reason("Reliability Engineer, Hardware"))
      .toBe("rejected_other_engineering_discipline");
    expect(reason("Machine Learning SoC Architect"))
      .toBe("rejected_other_engineering_discipline");
    expect(reason("Mechanical Engineer, Infrastructure"))
      .toBe("rejected_other_engineering_discipline");
    expect(reason("Optical Engineer, Test Automation and Optics NPI"))
      .toBe("rejected_other_engineering_discipline");
  });

  it("keeps low-level software disciplines that sit next to hardware", () => {
    expect(classifyTitleScope("Embedded Software Engineer (Starlink)").admitted).toBe(true);
    expect(classifyTitleScope("Firmware Engineer").admitted).toBe(true);
    expect(classifyTitleScope("Software Engineer - Hardware Test").admitted).toBe(true);
    expect(classifyTitleScope("SDE, MLA hardware/software co-design").admitted).toBe(true);
    expect(classifyTitleScope("Data Engineer, Hardware Reliability").admitted).toBe(true);
    expect(classifyTitleScope("Hardware Machine Learning Engineer").admitted).toBe(true);
    expect(classifyTitleScope("Systems Development Engineer, GPU Hardware").admitted).toBe(true);
    expect(classifyTitleScope(
      "Cybersecurity Engineer - Security Operations Center (SOC)"
    ).admitted).toBe(true);
  });

  it("preserves explicit software roles when context words have non-software meanings", () => {
    expect(classifyTitleScope(
      "Software Development Engineer, Software Defined Network Controller"
    ).admitted).toBe(true);
    expect(classifyTitleScope(
      "Software Development Engineer, Data Center Builder Tools"
    ).admitted).toBe(true);
    expect(classifyTitleScope(
      "Software Engineer, Data Centre Automation"
    ).admitted).toBe(true);
    expect(classifyTitleScope(
      "SDE, Manufacturing Execution Systems"
    ).admitted).toBe(true);

    // The override is intentionally contextual, not permission for every role
    // an employer happens to label SDE.
    expect(reason("SDE - CPLD / FPGA")).toBe("rejected_other_engineering_discipline");
    expect(reason("Manufacturing Engineer, Execution Systems"))
      .toBe("rejected_other_engineering_discipline");
    expect(reason("Data Center Engineer"))
      .toBe("rejected_other_engineering_discipline");
    expect(reason("Corporate Controller"))
      .toBe("rejected_non_technical_function");
  });

  it("rejects non-technical research rather than the whole research family", () => {
    expect(reason("UX Researcher")).toBe("rejected_non_technical_function");
    expect(reason("User Experience Researcher")).toBe("rejected_non_technical_function");
    expect(reason("Finance Expert - Equity Research")).toBe("rejected_non_technical_function");
    expect(reason("Research Operations Associate")).toBe("rejected_non_technical_function");
    expect(reason("Research Economist, Economic Research")).toBe("rejected_non_technical_function");
    expect(reason("Bloomberg Intelligence - Corporate Governance Research Analyst"))
      .toBe("rejected_non_technical_function");
    expect(reason("Bloomberg Intelligence - Private Markets Research Strategist"))
      .toBe("rejected_non_technical_function");
    expect(reason("Technical Strategist for AI Research - CTO Office"))
      .toBe("rejected_non_technical_function");
    expect(classifyTitleScope("Data Scientist").admitted).toBe(true);
    expect(classifyTitleScope("Applied Scientist II").admitted).toBe(true);
    expect(reason("Scientist II, Tech")).toBe("rejected_non_technical_function");
    expect(reason("Marketing Insights Researcher, Business - Enterprise GTM"))
      .toBe("rejected_non_technical_function");
    expect(reason("Research Scientist, Quantitative Growth Research"))
      .toBe("rejected_non_technical_function");
    expect(reason("Visiting Scholar — Post Training & Research"))
      .toBe("rejected_non_technical_function");

    expect(classifyTitleScope("Research Engineer, Pretraining").admitted).toBe(true);
    expect(classifyTitleScope("Research Scientist, Interpretability").admitted).toBe(true);
  });

  it("rejects roles that only borrow engineering vocabulary", () => {
    expect(reason("AI Tutor - Software Engineering Specialist")).toBe("rejected_non_technical_function");
    expect(reason("Systems Engineering Tutor")).toBe("rejected_non_technical_function");
    expect(reason("Campus Recruiter, Machine Learning")).toBe("rejected_non_technical_function");
    expect(reason("Enterprise Data Sales Specialist – Research & Data Science"))
      .toBe("rejected_non_technical_function");
    expect(reason("Electronic Trading Support Specialist - EMSX Trade Desk"))
      .toBe("rejected_non_technical_function");
    expect(reason("Associate Commercial Counsel, Cloud Consulting and Forward Deployed Engineers"))
      .toBe("rejected_non_technical_function");
    expect(reason("Device Backend Technician, Quantum AI"))
      .toBe("rejected_non_technical_function");
    expect(reason("Customer and Product Solutions Engineer, GenAI"))
      .toBe("rejected_non_technical_function");
    expect(reason("Developer Relations Engineer, Android"))
      .toBe("rejected_non_technical_function");
    expect(reason("Product Deployment Engineer, Measurement Services"))
      .toBe("rejected_non_technical_function");
    expect(reason("Gemini App Partner Engineer"))
      .toBe("rejected_non_technical_function");
  });

  it("rejects non-software implementation and hardware engineering roles", () => {
    expect(reason("Camera Control Systems Calibration Engineer"))
      .toBe("rejected_other_engineering_discipline");
    expect(reason("DFT Engineer, Google Cloud"))
      .toBe("rejected_other_engineering_discipline");
    expect(reason("Network Implementation Engineer, Network Delivery Implementation"))
      .toBe("rejected_other_engineering_discipline");
    expect(reason("Optical Network Engineer, Google Global Infrastructure"))
      .toBe("rejected_other_engineering_discipline");
    expect(reason("Rack Power Engineer, Platforms Infrastructure"))
      .toBe("rejected_other_engineering_discipline");
    expect(reason("Systems Yield Engineer, Quantum AI"))
      .toBe("rejected_other_engineering_discipline");
    expect(reason("Camera System Engineer"))
      .toBe("rejected_other_engineering_discipline");
    expect(reason("Camera Architect"))
      .toBe("rejected_other_engineering_discipline");
    expect(reason("Architect: Building, Site & Sustainability Engineering Team"))
      .toBe("rejected_other_engineering_discipline");
    expect(reason("Softgoods Developer"))
      .toBe("rejected_non_technical_function");
    expect(reason("Supply Chain Capacity Engineer"))
      .toBe("rejected_non_technical_function");
  });

  it("rejects explicit team leadership even when the discipline is technical", () => {
    expect(reason("Team Leader - Document Research")).toBe("rejected_management");
    expect(reason("Team Lead - Data Engineering")).toBe("rejected_management");
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

    // Still not a route back in for the business side of a trading firm.
    expect(classifyTitleScope("Trading Operations Manager").admitted).toBe(false);
    expect(classifyTitleScope("Equity Research Associate").admitted).toBe(false);
    expect(classifyTitleScope("Algorithmic Trading Intern").admitted).toBe(true);
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
  it("admits technical internship, co-op, and apprenticeship shapes", () => {
    for (const title of [
      "Software Engineering Intern",
      "Software Engineer Intern - Summer 2027",
      "Engineering Internship Program",
      "2027 Internships: Software Engineering",
      "Backend Engineer, Co-op",
      "Security Apprenticeships - 2027",
      "Co-Op Software Developer",
      "2027 Summer Interns - Machine Learning",
      "Security Engineering Apprentice",
      "iOS Intern",
      "Android Intern",
      "Mobile Intern",
      "Web Intern",
      "UI Intern",
      "Cybersecurity Intern",
      "DevOps Intern",
      "Cloud Intern",
      "Data Scientist Intern",
      "Applied Scientist Intern",
    ]) {
      const decision = classifyTitleScope(title);
      expect(decision.admitted).toBe(true);
    }
  });

  it("keeps explicit technical internships in business-domain teams", () => {
    for (const title of [
      "Software Engineer Intern, Finance",
      "Software Engineering Intern – Marketing Platform",
      "Backend Engineering Intern, Customer Support Systems",
      "Data Engineering Intern, Finance Platform",
      "Data Scientist Intern, Finance",
    ]) {
      expect(classifyTitleScope(title).admitted).toBe(true);
    }
  });

  it("does not broadly admit unrelated internships", () => {
    expect(classifyTitleScope("Marketing Intern").admitted).toBe(false);
    expect(classifyTitleScope("Finance Internship Program").admitted).toBe(false);
    for (const title of [
      "Software Sales Intern",
      "Software Marketing Intern",
      "Web Design Intern",
      "UI Design Intern",
      "AI Product Management Intern",
      "AI Product Intern",
      "Cloud Sales Intern",
      "Software Sales Engineer Intern",
      "Customer Support Engineer Intern",
    ]) {
      expect(classifyTitleScope(title).admitted).toBe(false);
    }
    expect(classifyTitleScope("Supplier Industrialization Engineering Intern").admitted).toBe(false);
    expect(classifyTitleScope("Device Process Integration Engineer - CMOS").admitted).toBe(false);
    expect(classifyTitleScope("Intern - Process Development Engineer, 3D DRAM CMP").admitted).toBe(false);
  });

  it("does not mistake ordinary words containing 'intern' for an internship", () => {
    expect(classifyTitleScope("Internal Tools Engineer").admitted).toBe(true);
    expect(classifyTitleScope("Software Engineer, Internationalization").admitted).toBe(true);
  });
});
