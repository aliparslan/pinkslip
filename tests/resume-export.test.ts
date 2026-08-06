import { describe, expect, test } from "bun:test";
import { buildTailoredResumePdf, tailoredResumePdfFileName } from "../packages/client/src/lib/pdf-resume";

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
