import { describe, expect, test } from "bun:test";
import { buildTailoredResumeTex } from "../frontend/src/lib/latex-resume";
import { buildTailoredResumeTypst } from "../frontend/src/lib/typst-resume";

const SOURCE_TEX = String.raw`
\documentclass[letterpaper,11pt]{article}
\newcommand{\resumeItem}[1]{\item\small{{#1 \vspace{-2pt}}}}
\newcommand{\resumeSubheading}[4]{\item #1 #2 #3 #4}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}}
\begin{document}
\begin{center}
  \textbf{\huge \scshape Example Person} \\
  \href{mailto:example@example.com}{example@example.com}
\end{center}

\section{Work Experience}
\resumeSubheading
  {Capital One}{August 2024 -- Present}
  {Software Engineer}{Dallas, TX}
  \resumeItemListStart
    \resumeItem{Redesigned Kafka consumer service to achieve 100\% data retention for millions of monthly interactions via a Dead-Letter-Queue implementation}
    \resumeItem{Published validation tooling work in \href{https://example.com/paper}{\underline{GigaScience}} with 250k+ genomic datasets}
    \resumeItem{Served as Learning \& Development Lead for 250+ associates, directing a 10-person committee}
  \resumeItemListEnd
\end{document}
`;

describe("resume export helpers", () => {
  test("patches matching TeX bullets while preserving original layout commands", () => {
    const output = buildTailoredResumeTex(
      String.raw`# Work Experience

- Improved reliability for millions of monthly interactions by redesigning the Kafka consumer service with Dead-Letter-Queue handling, resulting in 100% data retention.
- Designed unrelated spacecraft telemetry pipelines using C++ for orbital systems.`,
      { sourceTex: SOURCE_TEX }
    );

    expect(output).toContain(String.raw`\resumeSubheading`);
    expect(output).toContain(String.raw`\href{mailto:example@example.com}`);
    expect(output).toContain("Improved reliability for millions of monthly interactions");
    expect(output).toContain(String.raw`\href{https://example.com/paper}{\underline{GigaScience}}`);
    expect(output).toContain("Served as Learning \\& Development Lead");
    expect(output).not.toContain("spacecraft telemetry");
  });

  test("builds a Typst default resume without LaTeX-only syntax", () => {
    const output = buildTailoredResumeTypst(`# Example Person
example@example.com

# Skills
- TypeScript, React, SQL`);

    expect(output).toContain("#set page");
    expect(output).toContain("#resume-section(\"SKILLS\")");
    expect(output).toContain("- TypeScript, React, SQL");
    expect(output).not.toContain(String.raw`\documentclass`);
  });
});
