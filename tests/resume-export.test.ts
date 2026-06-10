import { describe, expect, test } from "bun:test";
import { buildTailoredResumePdf, tailoredResumePdfFileName } from "../frontend/src/lib/pdf-resume";
import { buildTypstResume, typstResumeFileName, convertInlineToTypst } from "../frontend/src/lib/typst-resume";

const SAMPLE_MARKDOWN = `# Alip Arslan
Dallas, TX | 571-526-8996 | [aliparslan@outlook.com](mailto:aliparslan@outlook.com) | [LinkedIn](https://linkedin.com/in/aliparslan) | [GitHub](https://github.com/aliparslan)

## Work Experience

**Capital One** | Dallas, TX | August 2024 -- Present
*Software Engineer*
- Invented a Lead Quality system (patent pending) that uses a custom fine-tuned Gemini model to score real-time chat sessions
- Redesigned Kafka consumer service to achieve 100% data retention for millions of monthly interactions via a Dead-Letter-Queue (DLQ) implementation

**Sheffield Lab of Computational Biology** | Charlottesville, VA | May 2022 -- September 2024
*Research Assistant*
- Developed a FastAPI/React validation tool to standardize metadata for 250k+ genomic datasets ([GigaScience, 2024](https://academic.oup.com/gigascience/article/doi/10.1093/gigascience/giae033/7712217))

## Education

**University of Virginia** | Charlottesville, VA | May 2025
*Master of Computer Science (MCS), GPA: 3.93*

## Projects

**Breadwinner** -- Full Stack | Solo project | [Live Demo](https://breadwinner.alip.page)
- Built personal finance platform enabling users to track expenses, manage monthly budgets, and visualize financial habits

**OneLearn** -- Full Stack | Team of 5
- Built peer-to-peer learning marketplace to connect thousands of engineers; placed 4th of 50 teams in global hackathon

## Skills

**Languages**: Python, Java, TypeScript, C#, Rust, SQL, HTML/CSS
**Technologies**: Spring Boot, AWS, Kafka, React, SolidJS, Kubernetes
**Certifications**: AWS Certified Solutions Architect -- Associate

## Leadership & Affiliations

**Technical**: CodePath (Tech Fellow), theCourseForum (Backend Team), ACM (Member)
**Honors**: UVA Double Hoo Research Grant Recipient (2023), 8x Dean's List Recipient`;

describe("typst resume generation", () => {
  test("generates valid Typst source with template and header", () => {
    const output = buildTypstResume(SAMPLE_MARKDOWN, {
      companyName: "Acme",
      jobTitle: "Engineer",
    });

    expect(output).toContain("#show: resume.with(");
    expect(output).toContain('author: "Alip Arslan"');
    expect(output).toContain('email: "aliparslan@outlook.com"');
    expect(output).toContain('phone: "571-526-8996"');
    expect(output).toContain('location: "Dallas, TX"');
    expect(output).toContain('github: "github.com/aliparslan"');
    expect(output).toContain('linkedin: "linkedin.com/in/aliparslan"');
    expect(output).toContain('font: "Inter"');
    expect(output).toContain("// Tailored for Acme");
  });

  test("generates section headings from markdown", () => {
    const output = buildTypstResume(SAMPLE_MARKDOWN);
    expect(output).toContain("== Work Experience");
    expect(output).toContain("== Education");
    expect(output).toContain("== Projects");
    expect(output).toContain("== Skills");
    expect(output).toContain("== Leadership & Affiliations");
  });

  test("emits #work() for work experience entries", () => {
    const output = buildTypstResume(SAMPLE_MARKDOWN);
    expect(output).toContain('#work(company: "Capital One", title: "Software Engineer", dates: "August 2024 -- Present", location: "Dallas, TX")');
    expect(output).toContain('#work(company: "Sheffield Lab of Computational Biology", title: "Research Assistant", dates: "May 2022 -- September 2024", location: "Charlottesville, VA")');
  });

  test("emits #edu() for education entries", () => {
    const output = buildTypstResume(SAMPLE_MARKDOWN);
    expect(output).toContain('#edu(institution: "University of Virginia", degree: "Master of Computer Science (MCS), GPA: 3.93", dates: "May 2025", location: "Charlottesville, VA")');
  });

  test("emits #project() for project entries", () => {
    const output = buildTypstResume(SAMPLE_MARKDOWN);
    expect(output).toContain('#project(name: "Breadwinner", role: "Full Stack | Solo project", url: "breadwinner.alip.page"');
    expect(output).toContain('#project(name: "OneLearn", role: "Full Stack | Team of 5"');
  });

  test("preserves links in bullets as #link()", () => {
    const output = buildTypstResume(SAMPLE_MARKDOWN);
    expect(output).toContain('#link("https://academic.oup.com/gigascience/article/doi/10.1093/gigascience/giae033/7712217")[GigaScience, 2024]');
  });

  test("renders skills as bold category with items", () => {
    const output = buildTypstResume(SAMPLE_MARKDOWN);
    expect(output).toContain("*Languages*: Python, Java, TypeScript, C\\#, Rust, SQL, HTML/CSS");
    expect(output).toContain("*Technologies*: Spring Boot, AWS, Kafka, React, SolidJS, Kubernetes");
    expect(output).toContain("*Certifications*: AWS Certified Solutions Architect -- Associate");
  });

  test("renders leadership/affiliation lines", () => {
    const output = buildTypstResume(SAMPLE_MARKDOWN);
    expect(output).toContain("*Technical*: CodePath (Tech Fellow), theCourseForum (Backend Team), ACM (Member)");
    expect(output).toContain("*Honors*: UVA Double Hoo Research Grant Recipient (2023), 8x Dean's List Recipient");
  });

  test("escapes Typst special characters in bullet text", () => {
    const md = `# Name
email@test.com

## Skills

**Languages**: C# & C++ @ Microsoft: $100k+`;
    const output = buildTypstResume(md);
    expect(output).toContain("\\#");
    expect(output).toContain("\\&");
    expect(output).toContain("\\@");
    expect(output).toContain("\\$");
  });

  test("generates a file name slug", () => {
    expect(typstResumeFileName("Capital One", "Software Engineer")).toBe(
      "capital-one-software-engineer-resume.pdf"
    );
    expect(typstResumeFileName(null, null)).toBe("tailored-resume.pdf");
  });
});

describe("convertInlineToTypst", () => {
  test("converts markdown links to Typst #link()", () => {
    const result = convertInlineToTypst("[Google](https://google.com)");
    expect(result).toContain('#link("https://google.com")[Google]');
  });

  test("converts bold to Typst strong", () => {
    const result = convertInlineToTypst("This is **important** text");
    expect(result).toContain("*important*");
  });

  test("converts italic to Typst emphasis", () => {
    const result = convertInlineToTypst("This is *emphasized* text");
    expect(result).toContain("_emphasized_");
  });

  test("handles mixed links and formatting", () => {
    const result = convertInlineToTypst("See [GigaScience](https://example.com) for **details**");
    expect(result).toContain('#link("https://example.com")[GigaScience]');
    expect(result).toContain("*details*");
  });

  test("escapes special characters outside of formatting", () => {
    const result = convertInlineToTypst("C# costs $100 & uses @decorators");
    expect(result).toContain("C\\#");
    expect(result).toContain("\\$100");
    expect(result).toContain("\\&");
    expect(result).toContain("\\@decorators");
  });
});

describe("two-line entry detection", () => {
  test("combines bold entry + italic subentry into #work()", () => {
    const md = `# Name
test@email.com

## Work Experience

**Acme Corp** | New York, NY | Jan 2023 -- Present
*Senior Engineer*
- Did great things`;
    const output = buildTypstResume(md);
    expect(output).toContain('#work(company: "Acme Corp", title: "Senior Engineer", dates: "Jan 2023 -- Present", location: "New York, NY")');
  });

  test("combines bold entry + italic subentry into #edu()", () => {
    const md = `# Name
test@email.com

## Education

**MIT** | Cambridge, MA | May 2020
*BS in Computer Science, GPA: 3.9*`;
    const output = buildTypstResume(md);
    expect(output).toContain('#edu(institution: "MIT", degree: "BS in Computer Science, GPA: 3.9", dates: "May 2020", location: "Cambridge, MA")');
  });

  test("handles entry without subentry line", () => {
    const md = `# Name
test@email.com

## Work Experience

**Solo Corp** | Remote | 2022 -- 2023
- Worked alone`;
    const output = buildTypstResume(md);
    expect(output).toContain('#work(company: "Solo Corp", title: "", dates: "2022 -- 2023", location: "Remote")');
    expect(output).toContain("- Worked alone");
  });
});

describe("pdf-lib fallback", () => {
  test("builds a one-page PDF from markdown", async () => {
    const bytes = await buildTailoredResumePdf(SAMPLE_MARKDOWN);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
  });

  test("generates a tailored file name", () => {
    expect(tailoredResumePdfFileName("Capital One", "Software Engineer")).toBe(
      "capital-one-software-engineer-resume.pdf"
    );
    expect(tailoredResumePdfFileName(null, null)).toBe("tailored-resume.pdf");
  });

  test("paginates content that is too long for one page", async () => {
    const longText = "# Name\nemail@example.com\n\nExperience\n" + "Company | Date\n".repeat(200);
    const onePage = await buildTailoredResumePdf(SAMPLE_MARKDOWN);
    const bytes = await buildTailoredResumePdf(longText);
    expect(bytes.length).toBeGreaterThan(onePage.length);
  });
});
