import { describe, expect, it } from "bun:test";
import {
  addressesAt,
  applyTemplate,
  cleanPersonName,
  deriveTemplates,
  isRoleAddress,
  likelyTemplate,
  patternEvidence,
} from "@worker/outreach/sourcing/email-pattern";
import {
  classifyRecruiter,
  earlyCareerQuery,
  matchCompany,
  parseLinkedInResult,
} from "@worker/outreach/sourcing/linkedin-search";
import { lookupMx, mailProvider, websiteDomain } from "@worker/outreach/sourcing/mail-domain";

// Every name here is made up.

describe("cleanPersonName", () => {
  it("drops credentials, pronouns, emoji and middle initials", () => {
    expect(cleanPersonName("Avery Q. Testerson, SHRM-CP")).toEqual({
      display: "Avery Q. Testerson",
      firsts: ["avery"],
      lasts: ["testerson"],
    });
    expect(cleanPersonName("Rowan Placeholder (she/her) 🌱")?.lasts).toEqual(["placeholder"]);
    expect(cleanPersonName("Dr. Imani Fakename PhD")?.firsts).toEqual(["imani"]);
  });

  it("keeps a nickname as a second first name", () => {
    expect(cleanPersonName("Katherine (Kit) Examplar")?.firsts).toEqual(["katherine", "kit"]);
  });

  it("folds accents and apostrophes, and offers every reading of a long last name", () => {
    expect(cleanPersonName("José Muñoz-Sample")).toEqual({
      display: "José Muñoz-Sample",
      firsts: ["jose"],
      lasts: ["munozsample", "munoz", "sample"],
    });
    expect(cleanPersonName("Liam O'Testly")?.lasts[0]).toBe("otestly");
    expect(cleanPersonName("Marisol Garcia Lopezz")?.lasts).toEqual(["lopezz", "garcialopezz", "garcia"]);
  });

  it("gives up on an abbreviated last name or a single word", () => {
    expect(cleanPersonName("Jordan T.")).toBeNull();
    expect(cleanPersonName("Recruiting")).toBeNull();
  });
});

describe("email templates", () => {
  const name = cleanPersonName("Avery Testerson")!;

  it("derives the template from a known address", () => {
    expect(deriveTemplates(name, "avery.testerson")).toEqual(["{first}.{last}"]);
    expect(deriveTemplates(name, "atesterson")).toEqual(["{f}{last}"]);
    expect(deriveTemplates(name, "avery")).toEqual(["{first}"]);
    expect(deriveTemplates(name, "averyt")).toEqual(["{first}{l}"]);
    expect(deriveTemplates(name, "testerson_avery")).toEqual(["{last}_{first}"]);
    expect(deriveTemplates(name, "atesterson2")).toEqual(["{f}{last}"]);
  });

  it("learns an unusual format the same way", () => {
    expect(deriveTemplates(name, "testerson-a")).toEqual(["{last}-{f}"]);
  });

  it("finds nothing when the address isn't this person's", () => {
    expect(deriveTemplates(name, "jordan.smith")).toEqual([]);
    expect(deriveTemplates(name, "at")).toEqual([]);
  });

  it("uses whichever last-name reading the address uses", () => {
    expect(deriveTemplates(cleanPersonName("José Muñoz-Sample")!, "jose.munoz")).toEqual(["{first}.{last}"]);
  });

  it("applies a template to someone else", () => {
    expect(applyTemplate("{f}{last}", cleanPersonName("Rowan Placeholder")!)).toBe("rplaceholder");
    expect(applyTemplate("{first}.{last}", cleanPersonName("Liam O'Testly")!)).toBe("liam.otestly");
  });
});

describe("pattern evidence", () => {
  const text = [
    "Press: contact Avery Testerson at avery.testerson@acme.example for interviews.",
    "Speaker Rowan Placeholder (rowan.placeholder@acme.example) leads campus hiring.",
    "Questions? careers@acme.example or jobs@eu.acme.example",
    "Unrelated: someone@other.example",
  ].join("\n");

  it("collects addresses at the domain and its subdomains", () => {
    expect(addressesAt(text, "acme.example")).toEqual(["avery.testerson", "rowan.placeholder", "careers", "jobs"]);
  });

  it("tells shared inboxes from people", () => {
    expect(isRoleAddress("careers")).toBe(true);
    expect(isRoleAddress("early-careers")).toBe(true);
    expect(isRoleAddress("university")).toBe(true);
    expect(isRoleAddress("avery.testerson")).toBe(false);
  });

  it("pairs addresses with the names they're built from and votes", () => {
    const evidence = patternEvidence(text, "acme.example");
    expect(evidence.map((item) => item.template)).toEqual(["{first}.{last}", "{first}.{last}"]);
    expect(likelyTemplate(evidence)).toEqual({ template: "{first}.{last}", votes: 2, total: 2 });
    expect(likelyTemplate([])).toBeNull();
  });
});

describe("LinkedIn search results", () => {
  it("builds one query naming the early-career titles and the company", () => {
    const query = earlyCareerQuery("Acme");
    expect(query.startsWith("site:linkedin.com/in (")).toBe(true);
    expect(query).toContain('"university recruiter" OR');
    expect(query.endsWith(' "Acme"')).toBe(true);
  });

  it("reads name, headline and Experience from a result", () => {
    const person = parseLinkedInResult({
      title: "Avery Testerson - University Recruiter - Acme | LinkedIn",
      link: "https://uk.linkedin.com/in/avery-testerson-123?trk=x",
      snippet: "University Recruiter at Acme · Experience: Acme · Education: State University · Location: Austin",
    });
    expect(person).toMatchObject({
      profileUrl: "https://www.linkedin.com/in/avery-testerson-123",
      rawName: "Avery Testerson",
      headline: "University Recruiter - Acme",
      experience: "Acme",
    });
  });

  it("ignores links that aren't profiles", () => {
    expect(parseLinkedInResult({ title: "Acme | LinkedIn", link: "https://www.linkedin.com/company/acme" })).toBeNull();
    expect(parseLinkedInResult({ title: "Post", link: "https://www.linkedin.com/posts/someone_hiring" })).toBeNull();
  });

  it("classifies the kind of recruiter", () => {
    const kind = (headline: string, snippet = "") => classifyRecruiter({ headline, snippet });
    expect(kind("University Recruiter - Acme")).toEqual({ kind: "early_career", weak: false });
    expect(kind("Early Careers Talent Acquisition @ Acme")).toEqual({ kind: "early_career", weak: false });
    expect(kind("Technical Recruiter at Acme")).toEqual({ kind: "technical", weak: false });
    expect(kind("Senior Recruiter | Acme")).toEqual({ kind: "recruiter", weak: false });
    expect(kind("Recruiting Coordinator at Acme")).toEqual({ kind: "coordinator", weak: false });
    expect(kind("Recruiting Intern at Acme")).toEqual({ kind: "intern", weak: false });
    expect(kind("Software Engineering Intern at Acme")).toEqual({ kind: "other", weak: false });
    expect(kind("Acme", "Campus Recruiter at Acme · Experience: Acme")).toEqual({ kind: "early_career", weak: true });
  });

  it("confirms the person is at the company now", () => {
    const at = (headline: string, experience: string | null, snippet = "") =>
      matchCompany({ headline, snippet, experience }, "Acme Inc.");
    expect(at("University Recruiter - Acme", "Acme")).toBe("current");
    expect(at("University Recruiter at Acme", null)).toBe("headline");
    expect(at("University Recruiter at Acme", "Globex")).toBe("former");
    expect(at("Campus Recruiter | ex-Acme", "Globex")).toBe("former");
    expect(at("Former University Recruiter at Acme", null)).toBe("former");
    expect(at("University Recruiter at Globex", "Globex")).toBe("none");
    // A different company whose name merely contains this one.
    expect(at("Recruiter at Acmeworks", null)).toBe("none");
  });
});

describe("mail domain", () => {
  it("reads the domain from a website", () => {
    expect(websiteDomain("https://www.acme.example/careers")).toBe("acme.example");
    expect(websiteDomain("acme.example")).toBe("acme.example");
    expect(websiteDomain("")).toBeNull();
  });

  it("names the mail provider", () => {
    expect(mailProvider(["aspmx.l.google.com"])).toBe("google");
    expect(mailProvider(["acme-example.mail.protection.outlook.com"])).toBe("microsoft");
    expect(mailProvider(["mx0a-001.pphosted.com"])).toBe("gateway");
    expect(mailProvider(["mx.acme.example"])).toBe("other");
  });

  it("reads MX records over DNS-over-HTTPS, best first", async () => {
    const fetcher = (async () => Response.json({
      Status: 0,
      Answer: [
        { type: 15, data: "20 alt1.aspmx.l.google.com." },
        { type: 15, data: "10 aspmx.l.google.com." },
        { type: 5, data: "cname.example." },
      ],
    })) as unknown as typeof fetch;
    expect(await lookupMx("acme.example", fetcher)).toEqual(["aspmx.l.google.com", "alt1.aspmx.l.google.com"]);
  });
});
