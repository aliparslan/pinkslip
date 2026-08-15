import { beforeAll, describe, expect, test } from "bun:test";
import { $typst } from "@myriaddreamin/typst.ts";
import { TypstSnippet } from "@myriaddreamin/typst.ts/contrib/snippet";
import { PDFDocument } from "pdf-lib";
import { createEmptyResumeProfile } from "../../../shared/resume-profile";
import type { TailoredResume } from "../../../shared/tailoring";
import { resumePreviewDataUrl } from "../src/lib/resume-document-client";
import { buildResumeTypstSource, cloneTailoredResume } from "../src/lib/resume-document";

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
  test("builds a self-contained preview URL without a blob dependency", () => {
    const url = resumePreviewDataUrl('<svg xmlns="http://www.w3.org/2000/svg"><text>A &amp; B</text></svg>');
    expect(url.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(url.split(",", 2)[1] ?? "")).toContain("A &amp; B");
  });

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
    await extracted.destroy();
  }, 30_000);
});
