import { describe, expect, test } from "bun:test";
import { parseResumeText } from "../packages/core/src/pdf-to-profile";

const ALIP_RESUME_TEXT = `Alip Arslan
571-526-8996 | Dallas, TX | aliparslan@outlook.com | github.com/aliparslan | linkedin.com/in/aliparslan | alip.dev
Work Experience
Capital One Dallas, TX
Senior Associate Software Engineer, AI Research July 2026 – Present
• Built a real-time message scoring service that automates approval of high-confidence AI chatbot responses across 50+ car dealerships,
pairing an LLM judge with a similarity-search scorer to cut response latency by 45%
• Owned the routing logic, Snowflake analytics layer, and rollout for scoring service, validating scorer accuracy against human reviewers
to move the system from shadow scoring to 70% of production traffic
Associate Software Engineer, AI Engineering August 2025 – July 2026
• Built a Claude agent workflow that scans 15 components daily and opens automated fix PRs for 80+ vulnerabilities monthly
• Led continuous delivery initiative across 4 products for a 12-engineer team, reducing release cycle from 3-6 weeks to weekly via testing
coverage gating across all environments, feature flags, and auto-merge deployment
• Co-invented a CLI harness that evaluates new model releases against a 60-conversation golden-dialog suite in parallel, cutting a full
day of manual testing from 6 hours to 15 minutes; adopted by team PMs and partner R&D org
• Directed 14-person committee as Learning & Development Lead for 250+ associates, across 42 professional and networking events
Sheffield Lab of Computational Biology Charlottesville, VA
Software Engineer (Research) May 2022 – September 2024
• Standardized metadata for 250k genomic datasets from NIH by building a FastAPI/React validation tool (co-author, GigaScience)
• Created benchmarking framework in Python to evaluate 22 transformer models for a vector-based search engine, improving query
relevance by 37% and inference speed by 18%
• Accelerated GC-content calculation for DNA sequences by 12x via a tiling and caching system using pre-computed windows in Rust
Northrop Grumman Charlottesville, VA
Software Engineer Intern June 2023 – August 2023
• Engineered containerization strategy for a 2M+ line legacy navigation application for the Navy, enabling air-gapped Kubernetes
deployment, zero-downtime updates, and multi-platform usability
• Led intern research optimizing C# codebase to resolve dependency bottlenecks, resulting in 6x faster application startup time
Skills
• Languages: Python, Java, TypeScript, JavaScript, SQL, HTML/CSS
• Frameworks/Tools: AWS, Spring Boot, Kafka, React, SolidJS, Kubernetes, Jenkins, PostgreSQL, Docker, Snowflake, Git
• AI/ML: PyTorch, LangGraph, LLM fine-tuning, RAG, embeddings & vector search, LLM-as-judge evaluation, shadow deployment
• Certifications: AWS Certified Solutions Architect (Associate)
• Patents: Co-inventor for two patents - LLM test automation for model evaluation, conversational quality scoring
Projects
Pinkslip Jobs – Full Stack | Solo project | pinkslip.alip.dev April 2026
• Built a job alerting pipeline on Cloudflare Workers that polls external sources, dedupes results, and pushes notifications on matches
• Shipped as an installable PWA or iOS app via a Capacitor wrapper, running entirely on edge infrastructure
Breadwinner – Full Stack | Solo project | breadwinner.alip.dev November 2025
• Built a personal finance platform with bank-statement ingestion, automated transaction categorization, interactive spending visual-
izations, and monthly budget tracking
• Integrated Gemini Flash for spending insights; deployed serverless on Cloudflare Pages and Supabase
OneLearn – Full Stack | Team of 5 September 2025
• Built a peer-to-peer learning marketplace where engineers request, upvote, and host sessions on professional growth topics; placed
4th of 48 teams in Capital One’s global hackathon
• Built the backend with FastAPI and PostgreSQL, with a React frontend for real-time event hosting and content voting
Education
University of Virginia Charlottesville, VA
Master of Computer Science (MCS), GPA: 3.93 May 2025
BA in Computer Science, BA in Cognitive Science May 2024`;

describe("PDF resume parsing", () => {
  const parsed = parseResumeText(ALIP_RESUME_TEXT);

  test("reads contact details and displayed profile links", () => {
    expect(parsed.contact).toEqual({
      name: "Alip Arslan",
      email: "aliparslan@outlook.com",
      phone: "571-526-8996",
      location: "Dallas, TX",
      linkedin: "https://linkedin.com/in/aliparslan",
      github: "https://github.com/aliparslan",
      website: "https://alip.dev",
    });
  });

  test("groups promoted roles and wrapped bullets without fragmentation", () => {
    expect(parsed.experience).toHaveLength(4);
    expect(parsed.experience?.map((entry) => entry.company)).toEqual([
      "Capital One",
      "Capital One",
      "Sheffield Lab of Computational Biology",
      "Northrop Grumman",
    ]);
    expect(parsed.experience?.map((entry) => entry.bullets.length)).toEqual([2, 4, 3, 2]);
    expect(parsed.experience?.[0].bullets[0]).toContain("dealerships, pairing an LLM judge");
    expect(parsed.experience?.[1].title).toBe("Associate Software Engineer, AI Engineering");
    expect(parsed.experience?.[2].startDate).toBe("May 2022");
    expect(parsed.experience?.[2].endDate).toBe("September 2024");
  });

  test("uses visual column separators emitted by the PDF extractor", () => {
    const columnar = parseResumeText(`Jane Doe
jane@example.com | Austin, TX
Experience
Acme Labs | New York, NY
Software Engineer | January 2024 – Present
• Built the product`);
    expect(columnar.experience?.[0]).toMatchObject({
      company: "Acme Labs",
      title: "Software Engineer",
      location: "New York, NY",
      startDate: "January 2024",
      endDate: "Present",
    });
  });

  test("keeps skill labels as skill groups instead of false section headings", () => {
    expect(parsed.skills).toHaveLength(5);
    expect(parsed.skills?.map((skill) => skill.category)).toEqual([
      "Languages",
      "Frameworks/Tools",
      "AI/ML",
      "Certifications",
      "Patents",
    ]);
  });

  test("extracts project names, links, dates, and complete bullets", () => {
    expect(parsed.projects).toHaveLength(3);
    expect(parsed.projects?.map((project) => project.name)).toEqual(["Pinkslip Jobs", "Breadwinner", "OneLearn"]);
    expect(parsed.projects?.map((project) => project.date)).toEqual(["April 2026", "November 2025", "September 2025"]);
    expect(parsed.projects?.[0].url).toBe("https://pinkslip.alip.dev");
    expect(parsed.projects?.[0]).toMatchObject({ role: "Full Stack", teamInfo: "Solo project" });
    expect(parsed.projects?.[2]).toMatchObject({ role: "Full Stack", teamInfo: "Team of 5" });
    expect(parsed.projects?.[1].bullets[0]).toContain("spending visualizations");
    expect(parsed.projects?.[2].bullets).toHaveLength(2);
  });

  test("repairs a visual line-break hyphen emitted as a separate text item", () => {
    const parsedSpacedHyphen = parseResumeText(`Jane Doe
jane@example.com
Projects
Portfolio January 2026
• Built interactive spending visual -
izations for monthly reporting`);

    expect(parsedSpacedHyphen.projects?.[0].bullets[0]).toContain("visualizations");
  });

  test("creates one attendance record with repeatable credentials", () => {
    expect(parsed.education).toHaveLength(1);
    expect(parsed.education?.[0].institution).toBe("University of Virginia");
    expect(parsed.education?.[0].credentials).toHaveLength(2);
    expect(parsed.education?.[0].credentials[0].degreeType).toBe("master");
    expect(parsed.education?.[0].credentials[0].fieldsOfStudy).toEqual(["Computer Science"]);
    expect(parsed.education?.[0].gpa).toBe("3.93");
    expect(parsed.education?.[0].endDate).toBe("May 2025");
    expect(parsed.education?.[0].credentials[1].degreeType).toBe("bachelor");
    expect(parsed.education?.[0].credentials[1].fieldsOfStudy).toEqual([
      "Computer Science",
      "Cognitive Science",
    ]);
  });

  test("parses combined technical-resume rows without reversing title and company", () => {
    const technical = parseResumeText(`Undergraduate Student
518-421-7587 • student@mit.edu • linkedin.com/in/mit-student
EDUCATION
Massachusetts Institute of Technology | Cambridge, MA | May 2026
Bachelor of Science degree in Electrical Engineering and Computer Science
Coursework: Algorithms, Machine Learning, Linear Algebra
SKILLS & TECHNICAL TOOLS
Languages: Python, Java, C++
Technologies: PyTorch, Docker,
Git, Django
EXPERIENCE
Software Engineering Analyst Intern | Magna, Office of the CEO | City, ST | Jun 2024 - Present
● Built internal engineering prototypes
PROJECTS
Autonomous UAV | PyTorch, OpenCV | Spring 2024
● Built a real-time navigation system`);

    expect(technical.experience).toHaveLength(1);
    expect(technical.experience?.[0]).toMatchObject({
      title: "Software Engineering Analyst Intern",
      company: "Magna, Office of the CEO",
      location: "City, ST",
      startDate: "Jun 2024",
      endDate: "Present",
    });
    expect(technical.education).toHaveLength(1);
    expect(technical.education?.[0].credentials[0].fieldsOfStudy).toEqual([
      "Electrical Engineering and Computer Science",
    ]);
    expect(technical.skills).toEqual([
      { category: "Languages", items: "Python, Java, C++" },
      { category: "Technologies", items: "PyTorch, Docker, Git, Django" },
    ]);
    expect(technical.projects?.[0].date).toBe("Spring 2024");
  });

  test("handles private-use bullets and combined project, activity, and hobby headings", () => {
    const annotatedExport = parseResumeText(`Jordan Lee
Los Angeles, CA | 555-010-2020 | jordan@example.com | linkedin.com/in/jordanlee
EDUCATION
WEST COAST UNIVERSITY | SCHOOL OF SOCIAL SCIENCES | LOS ANGELES, CA
Bachelor of Arts in International Studies | Minor in Accounting | | B.A. Expected June 2026
COAST COMMUNITY COLLEGE | SANTA MONICA, CA
Associates of Arts in Social Science | Associates of Arts in Humanities | | June 2024
\uF0B7 Cumulative GPA: 3.69/4.00
EXPERIENCE
ACME LABS | SANTA MONICA, CA
Storytelling Fellow | June 2023-August 2023
\uF0B7 Led a cross-functional team
\uF0B7 Presented the work to company leaders
SUNRISE CAFE | LOS ANGELES, CA
Barista | March 2021-Present
\uF0B7 Managed a high-volume service counter
TOMORROW LLC | LOS ANGELES, CA
Barista | August 2021 – March 2022
\uF0B7 Improved the company social strategy
INDEPENDENT VIDEOGRAPHER | NEW KENT, VA
Videographer | October 2020 – December 2020
\uF0B7 Filmed and edited a large event
PROJECT EXPERIENCE & ACTIVITIES
ACCESSIBILITY PROJECT | SANTA MONICA, CA
Project Manager & Storyteller | August 2023
\uF0B7 Coordinated engineering, design, and marketing
\uF0B7 Interviewed users and synthesized findings
\uF0B7 Presented the final recommendation
FILM CLUB | SANTA MONICA, CA
Finance Team & Producer | September 2021-June 2023
\uF0B7 Managed budgets for student productions
SKILLS & HOBBIES
Languages: Vietnamese, Chinese
Technology: Excel, QuickBooks, Adobe Creative Suite
Skills: Parallel parking`);

    expect(annotatedExport.contact?.location).toBe("Los Angeles, CA");
    expect(annotatedExport.experience).toHaveLength(4);
    expect(annotatedExport.experience?.map((entry) => entry.bullets.length)).toEqual([2, 1, 1, 1]);
    expect(annotatedExport.experience?.[0].bullets[0]).toBe("Led a cross-functional team");
    expect(annotatedExport.projects?.map((project) => project.name)).toEqual([
      "ACCESSIBILITY PROJECT",
      "FILM CLUB",
    ]);
    expect(annotatedExport.projects?.map((project) => project.date)).toEqual([
      "August 2023",
      "September 2021 – June 2023",
    ]);
    expect(annotatedExport.projects?.map((project) => project.bullets.length)).toEqual([3, 1]);
    expect(annotatedExport.skills?.map((skill) => skill.category)).toEqual([
      "Languages",
      "Technology",
      "Skills",
    ]);
    expect(annotatedExport.education).toHaveLength(2);
    expect(annotatedExport.education?.[0].credentials).toHaveLength(1);
    expect(annotatedExport.education?.[0].credentials[0].fieldsOfStudy).toEqual(["International Studies"]);
    expect(annotatedExport.education?.[0].minors).toEqual(["Accounting"]);
    expect(annotatedExport.education?.[1].credentials).toHaveLength(2);
    expect(annotatedExport.education?.[1].credentials.map((credential) => credential.fieldsOfStudy[0])).toEqual([
      "Social Science",
      "Humanities",
    ]);
    expect(annotatedExport.education?.[1].gpa).toBe("3.69");
  });

  test("ignores sample cover labels and keeps compact template sections intact", () => {
    const template = parseResumeText(`Sample Resumes
Masters II Resume
C HARLES M ENG
Cambridge, MA | 617.123.4567 | csmeng@mit.edu
EDUCATION
Massachusetts Institute of Technology (MIT) | Cambridge, MA
Candidate for Master of Engineering in Computer Science; GPA: 5.0/5.0 | Expected June 20XX
Bachelor of Science in Computer Science; GPA: 4.6/5.0 | June 20XX
• Concentration: Human-Computer Interaction
• Master’s Thesis: Search Tools for Code Review
EXPERIENCE
User Interface Design Group; CSAIL, MIT | Cambridge, MA
Researcher | Oct. 20XX–Present
Designed search tools for large classrooms.
LEADERSHIP
MIT Student Cultural Association | Cambridge, MA
Treasurer | May 20XX – Present
• Managed the annual budget
SKILLS AND INTERESTS
• Python, C++, Java, MATLAB`);

    expect(template.contact?.name).toBe("CHARLES MENG");
    expect(template.education).toHaveLength(1);
    expect(template.education?.[0].credentials).toHaveLength(2);
    expect(template.education?.[0].gpa).toBe("5.0");
    expect(template.experience?.[0]).toMatchObject({
      company: "User Interface Design Group; CSAIL, MIT",
      title: "Researcher",
      startDate: "Oct 20XX",
      endDate: "Present",
      bullets: ["Designed search tools for large classrooms."],
    });
    expect(template.optionalSections?.[0]).toMatchObject({
      kind: "leadership",
      items: [{ category: "Treasurer · MIT Student Cultural Association" }],
    });
    expect(template.skills).toEqual([{ category: "Skills", items: "Python, C++, Java, MATLAB" }]);
  });
});

// The lines PDF.js gives for tests/fixtures/resume-import/latex-resume.pdf:
// the common LaTeX layout, with LaTeX's default "–" bullets.
const LATEX_RESUME_LINES = `Jordan Lee
jordan.lee@example.com | (555) 010-2030 | linkedin.com/in/jordanlee-example | github.com/jordanlee-example
Education
Example State University | May 2025
B.S. in Computer Science, Minor in Business Administration | Springfield, IL
– Coursework: Operating Systems, Data Structures & Algorithms, Software Engineering, Databases,
Computer Networks, Computer Organization, Human-Computer Interaction
Experience
Northwind Bank | Aug 2025 – Present
Software Engineer | Go, Python, AWS Lambda, PostgreSQL | Dallas, TX
– Built a Go service that opens pull requests for dependency fixes across 40 repositories, closing 38
vulnerabilities in a quarter.
– Moved a billing database with a billion rows to a managed cluster, owning the schema checks, cut-over and
rollback plan.
Contoso Instruments | May 2024 – Aug 2024
Software Engineer Intern | Python, C, Embedded Systems | Austin, TX
– Wrote a tool that compares device support across chip families, replacing a week of manual searching.
Fabrikam Aerospace – Space Division | May 2023 – Aug 2023
Software Engineer Intern | Python, JavaScript | Huntsville, AL
– Extracted thousands of attributes from a systems model into structured JSON.
Projects
Plant Identifier
React, AWS S3, Python, Flask, Machine Learning
– Trained a convolutional network that names houseplants from photos with 95% accuracy.
– Built a React front end and Flask API that store each upload in S3.
Alumni Paths
C++, Graph Algorithms, Data Processing
– Placed second in a class hackathon by modelling where graduates go next.
Leadership & Involvement
Learning Committee | Aug 2025 – Present
Committee Member and Cloud Instructor, Northwind Bank | Dallas, TX
– Taught a cloud storage workshop for 30 engineers.
Computing Student Union | May 2023 – May 2025
Co-Founder and Treasurer, Example State University | Springfield, IL
– Co-founded a club for incoming computer science students.
Technical Skills
Languages: Go, Python, Java, C++, JavaScript, SQL, Bash, MATLAB
Technologies: AWS Lambda, PostgreSQL, React, Flask, Docker, Git`;

describe("the common LaTeX resume layout", () => {
  const profile = parseResumeText(LATEX_RESUME_LINES);

  test("reads \"Company | dates\" over \"Title | stack | city\" as one role", () => {
    expect(profile.experience?.map(({ company, title, location, startDate, endDate }) => ({ company, title, location, startDate, endDate }))).toEqual([
      { company: "Northwind Bank", title: "Software Engineer", location: "Dallas, TX", startDate: "Aug 2025", endDate: "Present" },
      { company: "Contoso Instruments", title: "Software Engineer Intern", location: "Austin, TX", startDate: "May 2024", endDate: "Aug 2024" },
      { company: "Fabrikam Aerospace – Space Division", title: "Software Engineer Intern", location: "Huntsville, AL", startDate: "May 2023", endDate: "Aug 2023" },
    ]);
    expect(profile.experience?.[0].bullets).toEqual([
      "Built a Go service that opens pull requests for dependency fixes across 40 repositories, closing 38 vulnerabilities in a quarter.",
      "Moved a billing database with a billion rows to a managed cluster, owning the schema checks, cut-over and rollback plan.",
    ]);
  });

  test("keeps the school's date and city when the degree line carries the city, and splits off the minor", () => {
    expect(profile.education).toHaveLength(1);
    expect(profile.education?.[0]).toMatchObject({
      institution: "Example State University",
      location: "Springfield, IL",
      endDate: "May 2025",
      minors: ["Business Administration"],
    });
    expect(profile.education?.[0].credentials.map(({ degreeType, fieldsOfStudy }) => ({ degreeType, fieldsOfStudy }))).toEqual([
      { degreeType: "bachelor", fieldsOfStudy: ["Computer Science"] },
    ]);
  });

  test("skips a project's stack line and starts the next project after a finished bullet", () => {
    expect(profile.projects?.map(({ name, role, bullets }) => ({ name, role, bullets: bullets.length }))).toEqual([
      { name: "Plant Identifier", role: undefined, bullets: 2 },
      { name: "Alumni Paths", role: undefined, bullets: 1 },
    ]);
  });

  test("files Leadership & Involvement as leadership, and leaves MATLAB whole", () => {
    expect(profile.optionalSections).toEqual([{
      kind: "leadership",
      items: [
        { category: "Committee Member and Cloud Instructor, Northwind Bank · Learning Committee", items: "Dallas, TX · Aug 2025 – Present · Taught a cloud storage workshop for 30 engineers." },
        { category: "Co-Founder and Treasurer, Example State University · Computing Student Union", items: "Springfield, IL · May 2023 – May 2025 · Co-founded a club for incoming computer science students." },
      ],
    }]);
    expect(profile.skills?.[0]).toEqual({ category: "Languages", items: "Go, Python, Java, C++, JavaScript, SQL, Bash, MATLAB" });
    expect(profile.contact).toMatchObject({ name: "Jordan Lee", email: "jordan.lee@example.com", phone: "(555) 010-2030" });
  });
});
