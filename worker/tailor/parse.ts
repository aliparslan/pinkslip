export interface ParsedTailoring {
  resume_md: string;
  cover_letter_md: string;
  qa_json: string;
}

const SECTION_RESUME = "=== RESUME ===";
const SECTION_COVER = "=== COVER ===";
const SECTION_QA = "=== QA ===";

function extractLargestJsonSubstring(input: string): string | null {
  const start = input.indexOf("{");
  const end = input.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return input.slice(start, end + 1);
}

function parseQaSection(section: string): string {
  const trimmed = section.trim();
  if (!trimmed) {
    return JSON.stringify({
      why_company: "",
      biggest_project: "",
      technical_challenge: "",
      gap_to_role: "",
    });
  }

  const candidates = [trimmed, extractLargestJsonSubstring(trimmed)].filter(
    (value): value is string => Boolean(value)
  );

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // Keep trying fallbacks.
    }
  }

  return JSON.stringify(
    {
      why_company: trimmed,
      biggest_project: "",
      technical_challenge: "",
      gap_to_role: "",
    },
    null,
    2
  );
}

export function parseTailoringText(fullText: string): ParsedTailoring {
  const withResume = fullText.includes(SECTION_RESUME)
    ? fullText
    : `${SECTION_RESUME}\n${fullText}`;
  const [, afterResume = ""] = withResume.split(SECTION_RESUME);
  const [resumePart = "", afterCover = ""] = afterResume.split(SECTION_COVER);
  const [coverPart = "", qaPart = ""] = afterCover.split(SECTION_QA);

  return {
    resume_md: resumePart.trim(),
    cover_letter_md: coverPart.trim(),
    qa_json: parseQaSection(qaPart),
  };
}
