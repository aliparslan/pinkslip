import { beforeAll, describe, expect, test } from "bun:test";
import { $typst } from "@myriaddreamin/typst.ts";
import { TypstSnippet } from "@myriaddreamin/typst.ts/contrib/snippet";
import { PDFDocument } from "pdf-lib";
import { createEmptyResumeProfile } from "../../../shared/resume-profile";
import type { TailoredResume } from "../../../shared/tailoring";
import { verifyResumeExtractedText } from "../src/lib/resume-document-client";
import {
  advanceResumeFit,
  buildResumeTypstSource,
  cloneTailoredResume,
  removeLowestPriorityContent,
  restoreAllSpaceRemovedContent,
  restoreRemovedContent,
} from "../src/lib/resume-document";

beforeAll(async () => {
  const fontNames = [
    "SourceSans3-Regular.ttf",
    "SourceSans3-Semibold.ttf",
    "SourceSans3-Bold.ttf",
  ];
  const fonts = await Promise.all(fontNames.map(async (name) => new Uint8Array(
    await Bun.file(new URL(`../src/assets/fonts/${name}`, import.meta.url)).arrayBuffer(),
  )));
  $typst.use(
    TypstSnippet.disableDefaultFontAssets(),
    TypstSnippet.preloadFonts(fonts),
  );
});

describe("Typst resume compiler", () => {
  test("compiles the deterministic template into an extractable PDF", async () => {
    const profile = {
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
        id: "role-1",
        company: "Acme",
        title: "Software Engineer",
        location: "Austin, TX",
        startDate: "2022",
        endDate: "Present",
        bullets: ["Reduced request latency by 40% using caching."],
      }],
      education: [{
        id: "school-1",
        institution: "Example University",
        credentials: [{ id: "degree-1", degreeType: "bachelor" as const, fieldsOfStudy: ["Computer Science"] }],
        minors: [],
        location: "Austin, TX",
        startDate: "2018",
        endDate: "2022",
      }],
    };
    const resume: TailoredResume = {
      schemaVersion: 2,
      contact: profile.contact,
      experience: profile.experience.map((entry) => ({
        sourceEntryId: entry.id,
        company: entry.company,
        title: entry.title,
        location: entry.location,
        startDate: entry.startDate,
        endDate: entry.endDate,
        bullets: entry.bullets.map((text, index) => ({
          id: `bullet-${index}`,
          text,
          evidenceIds: [`evidence-${index}`],
        })),
      })),
      education: profile.education,
      projects: [],
      skills: profile.skills,
      optionalSections: profile.optionalSections,
      removedForSpace: [],
    };
    const reactiveDraft = new Proxy(resume, {});
    const plainDraft = cloneTailoredResume(reactiveDraft);
    expect(plainDraft).toEqual(resume);
    expect(plainDraft).not.toBe(reactiveDraft);
    const source = buildResumeTypstSource(resume);
    const bytes = await $typst.pdf({ mainContent: source });
    expect(bytes).toBeTruthy();
    const document = await PDFDocument.load(Uint8Array.from(bytes ?? []));
    expect(document.getPageCount()).toBe(1);
    expect(source.indexOf("Experience")).toBeLessThan(source.indexOf("Education"));
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const extracted = await getDocument({ data: Uint8Array.from(bytes ?? []) }).promise;
    const page = await extracted.getPage(1);
    const text = (await page.getTextContent()).items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    expect(text).toContain("Jane Doe");
    expect(text).toContain("Reduced request latency by 40% using caching.");
    expect(text.indexOf("EXPERIENCE")).toBeLessThan(text.indexOf("EDUCATION"));
    expect(verifyResumeExtractedText(resume, text)).toEqual({
      valid: true,
      missing: [],
      extractedCharacters: expect.any(Number),
    });
    expect(verifyResumeExtractedText(resume, "Jane Doe jane@example.com").missing).toContain(
      "title: Software Engineer",
    );
    await extracted.destroy();
  }, 30_000);

  test("keeps restored optional content through later fit passes", () => {
    const profile = createEmptyResumeProfile();
    const resume: TailoredResume = {
      schemaVersion: 2,
      contact: profile.contact,
      experience: [],
      education: [],
      projects: [],
      skills: [],
      optionalSections: [{
        kind: "certifications",
        items: [{ category: "Cloud", items: "Example certification" }],
      }],
      removedForSpace: [],
    };
    const removed = removeLowestPriorityContent(resume, []);
    expect(removed.removed?.section).toBe("optionalSections");
    const restored = restoreRemovedContent(removed.resume, 0);
    expect(restored.restored).toBe(true);
    expect(restored.resume.optionalSections[0]?.items).toHaveLength(1);
    expect(removeLowestPriorityContent(restored.resume, []).removed).toBeNull();
  });

  test("tries the compact 11 pt template before removing content", () => {
    const profile = createEmptyResumeProfile();
    const resume: TailoredResume = {
      schemaVersion: 2,
      contact: profile.contact,
      experience: [{
        sourceEntryId: "role-1",
        company: "Example",
        title: "Engineer",
        location: "Austin, TX",
        startDate: "2024",
        endDate: "Present",
        bullets: [
          { id: "bullet-1", text: "First supported result.", evidenceIds: ["evidence-1"] },
          { id: "bullet-2", text: "Second supported result.", evidenceIds: ["evidence-2"] },
        ],
      }],
      education: [],
      projects: [],
      skills: [],
      optionalSections: [],
      removedForSpace: [],
    };

    const compactPass = advanceResumeFit(resume, "standard", []);
    expect(compactPass.density).toBe("compact");
    expect(compactPass.removed).toBeNull();
    expect(compactPass.resume.experience[0].bullets).toHaveLength(2);

    const removalPass = advanceResumeFit(compactPass.resume, "compact", []);
    expect(removalPass.removed?.section).toBe("experience");
    expect(removalPass.resume.experience[0].bullets).toHaveLength(1);
  });

  test("refits saved space removals from the fullest draft in their original order", () => {
    const profile = createEmptyResumeProfile();
    const resume: TailoredResume = {
      schemaVersion: 2,
      contact: profile.contact,
      experience: [{
        sourceEntryId: "role-1",
        company: "Example",
        title: "Engineer",
        location: "Austin, TX",
        startDate: "2024",
        endDate: "Present",
        bullets: [
          { id: "bullet-1", text: "First result.", evidenceIds: ["evidence-1"] },
          { id: "bullet-2", text: "Second result.", evidenceIds: ["evidence-2"] },
          { id: "bullet-3", text: "Third result.", evidenceIds: ["evidence-3"] },
        ],
      }],
      education: [],
      projects: [],
      skills: [],
      optionalSections: [],
      removedForSpace: [],
    };
    const firstRemoval = removeLowestPriorityContent(resume, []);
    const secondRemoval = removeLowestPriorityContent(firstRemoval.resume, []);
    expect(secondRemoval.resume.experience[0].bullets.map((bullet) => bullet.text)).toEqual(["First result."]);

    const restored = restoreAllSpaceRemovedContent(secondRemoval.resume);
    expect(restored.experience[0].bullets.map((bullet) => bullet.text)).toEqual([
      "First result.",
      "Second result.",
      "Third result.",
    ]);
    expect(restored.removedForSpace).toEqual([]);
  });
});
