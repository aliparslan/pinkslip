import { describe, expect, test } from "bun:test";
import { createEmptyResumeProfile, type ResumeProfile } from "../shared/resume-profile";
import {
  buildCandidateEvidence,
  validateTailoredResume,
} from "../shared/tailoring";
import {
  buildResumeFromRewrites,
  createTailoringPlan,
  generateStructuredResume,
} from "../worker/tailor/structured";
import { buildResumeTypstSource, removeLowestPriorityContent } from "../packages/client/src/lib/resume-document";

function profile(): ResumeProfile {
  return {
    ...createEmptyResumeProfile(),
    contact: {
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "555-0100",
      location: "Austin, TX",
      linkedin: "https://linkedin.com/in/jane",
      github: "",
      website: "",
    },
    experience: [{
      id: "experience-1",
      company: "Acme",
      title: "Software Engineer",
      location: "Austin, TX",
      startDate: "2022",
      endDate: "Present",
      bullets: [
        "Reduced request latency by 40% using caching.",
        "Built a TypeScript service used by 12 teams.",
      ],
    }],
    education: [{
      id: "school-1",
      institution: "Example University",
      credentials: [{ id: "degree-1", degreeType: "bachelor", fieldsOfStudy: ["Computer Science"] }],
      minors: ["Design"],
      location: "Austin, TX",
      startDate: "2018",
      endDate: "2022",
    }],
    skills: [{ category: "Languages", items: "TypeScript, SQL" }],
  };
}

describe("structured resume grounding", () => {
  test("builds stable evidence ids and copies metadata instead of generating it", () => {
    const source = profile();
    const first = buildCandidateEvidence(source);
    const second = buildCandidateEvidence(source);
    expect(first).toEqual(second);

    const resume = buildResumeFromRewrites({
      profile: source,
      evidence: first,
      selectedEvidenceIds: first.filter((item) => item.sourceType === "experience").map((item) => item.id),
      rewrites: [{ evidenceId: first[0].id, text: "Cut request latency by 40% with caching." }],
    });

    expect(resume.contact).toEqual(source.contact);
    expect(resume.experience[0]).toMatchObject({
      company: "Acme",
      title: "Software Engineer",
      startDate: "2022",
      endDate: "Present",
    });
    expect(validateTailoredResume(source, first, resume)).toEqual({ valid: true, issues: [] });
  });

  test("rejects unsupported numbers and changed metadata", () => {
    const source = profile();
    const evidence = buildCandidateEvidence(source);
    const resume = buildResumeFromRewrites({
      profile: source,
      evidence,
      selectedEvidenceIds: [evidence[0].id],
      rewrites: [{ evidenceId: evidence[0].id, text: "Reduced latency by 75% with React caching." }],
    });
    resume.experience[0].company = "Invented Corp";
    const validation = validateTailoredResume(source, evidence, resume);
    expect(validation.valid).toBe(false);
    expect(validation.issues.map((issue) => issue.code)).toContain("unsupported_number");
    expect(validation.issues.map((issue) => issue.code)).toContain("unsupported_claim");
    expect(validation.issues.map((issue) => issue.code)).toContain("metadata_changed");
  });

  test("rejects copied sections and evidence attached to the wrong entry", () => {
    const source = profile();
    source.projects = [{
      id: "project-1",
      name: "Portfolio",
      url: "",
      bullets: ["Built an accessible portfolio."],
    }];
    const evidence = buildCandidateEvidence(source);
    const selected = evidence.filter((item) => item.sourceType === "experience").map((item) => item.id);
    const resume = buildResumeFromRewrites({ profile: source, evidence, selectedEvidenceIds: selected, rewrites: [] });
    const projectEvidence = evidence.find((item) => item.sourceType === "project");
    if (!projectEvidence) throw new Error("Missing project evidence fixture");
    resume.experience[0].bullets[0].evidenceIds = [projectEvidence.id];
    resume.skills[0].items = "TypeScript, SQL, React";

    const validation = validateTailoredResume(source, evidence, resume);
    expect(validation.valid).toBe(false);
    expect(validation.issues.some((issue) => issue.message.includes("different resume entry"))).toBe(true);
    expect(validation.issues.some((issue) => issue.path === "skills")).toBe(true);
  });

  test("falls back to exact source evidence when the constrained repair still fails review", async () => {
    const source = profile();
    const evidence = buildCandidateEvidence(source);
    const evidenceId = evidence.find((item) => item.sourceType === "experience")?.id;
    if (!evidenceId) throw new Error("Missing experience evidence fixture");
    const outputs = [
      { rewrites: [{ evidenceId, text: "Reduced request latency by 40% using caching." }] },
      { issues: [{ evidenceId, reason: "The result is not directly supported." }] },
      { rewrites: [{ evidenceId, text: "Reduced request latency by 40% using caching." }] },
      { issues: [{ evidenceId, reason: "The result remains unsupported." }] },
    ];
    const ai = {
      async run() {
        const next = outputs.shift();
        if (!next) throw new Error("Unexpected model call");
        return {
          choices: [{ message: { content: JSON.stringify(next) } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        };
      },
    } as unknown as Ai;

    const result = await generateStructuredResume({
      ai,
      model: "@cf/zai-org/glm-4.7-flash",
      profile: source,
      description: "Improve backend performance.",
      evidence,
      selectedEvidenceIds: [evidenceId],
    });

    expect(result.repaired).toBe(true);
    expect(result.validation).toEqual({ valid: true, issues: [] });
    expect(result.resume.experience[0].bullets[0].text).toBe(source.experience[0].bullets[0]);
    expect(outputs).toHaveLength(0);
  });

  test("caps default bullet evidence while retaining all requirement matches", async () => {
    const source = profile();
    source.experience[0].bullets = Array.from(
      { length: 10 },
      (_, index) => `Built production service capability ${index + 1}.`,
    );
    const evidence = buildCandidateEvidence(source);
    const bulletIds = evidence.filter((item) => item.sourceType === "experience").map((item) => item.id);
    const ai = {
      async run() {
        return {
          choices: [{ message: { content: JSON.stringify({
            requirements: [
              {
                text: "Build reliable production services",
                priority: "required",
                keywords: ["reliable"],
                evidenceIds: bulletIds.slice(2, 8),
                reason: "Direct production evidence",
              },
              {
                text: "Improve backend systems",
                priority: "required",
                keywords: ["backend"],
                evidenceIds: bulletIds.slice(4, 10),
                reason: "Direct backend evidence",
              },
            ],
          }) } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        };
      },
    } as unknown as Ai;

    const result = await createTailoringPlan({
      ai,
      model: "@cf/zai-org/glm-4.7-flash",
      description: "Build reliable backend services.",
      evidence,
    });

    expect(result.plan.matches.flatMap((match) => match.evidenceIds)).toHaveLength(12);
    expect(result.plan.selectedEvidenceIds).toHaveLength(8);
    expect(result.plan.selectedEvidenceIds.every((id) => bulletIds.includes(id))).toBe(true);
    expect(result.plan.selectedEvidenceIds).toContain(bulletIds[0]);
  });

  test("the Typst source stays ATS-safe and never drops below 11 pt", () => {
    const source = profile();
    const evidence = buildCandidateEvidence(source);
    const resume = buildResumeFromRewrites({
      profile: source,
      evidence,
      selectedEvidenceIds: evidence.filter((item) => item.sourceType === "experience").map((item) => item.id),
      rewrites: [],
    });
    const typst = buildResumeTypstSource(resume);
    expect(typst).toContain('font: "Source Sans 3"');
    expect(typst).toContain("size: 11pt");
    expect(typst).not.toMatch(/#(?:set\s+)?text\([^)]*size:\s*(?:[1-9]|10)(?:\.\d+)?pt/);

    const removed = removeLowestPriorityContent(resume, evidence.map((item) => item.id));
    expect(removed.removed?.evidenceId).toBeTruthy();
    expect(removed.resume.removedForSpace).toHaveLength(1);
  });
});
