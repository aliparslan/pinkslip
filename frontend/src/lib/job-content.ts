function normalizeText(value: string): string {
  return value.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

function normalizeHeading(value: string): string {
  return normalizeText(value)
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const REPEATED_DESCRIPTION_SECTION_LABELS = new Set([
  "about the role",
  "about the job",
  "job description",
]);

function isRepeatedDescriptionSectionLabel(value: string): boolean {
  return REPEATED_DESCRIPTION_SECTION_LABELS.has(normalizeHeading(value));
}

export function isDuplicateLeadingJobHeading(
  heading: string,
  context: { title?: string | null; companyName?: string | null } = {}
): boolean {
  const normalized = normalizeHeading(heading);
  if (!normalized) return false;

  if (isRepeatedDescriptionSectionLabel(heading)) return true;

  const title = normalizeHeading(context.title ?? "");
  const company = normalizeHeading(context.companyName ?? "");
  return normalized === title
    || normalized === company
    || Boolean(title && company && normalized === `${title} at ${company}`);
}

const LOCATION_ABBREVIATIONS: Record<string, string> = {
  California: "CA",
  Colorado: "CO",
  "District of Columbia": "DC",
  Georgia: "GA",
  Illinois: "IL",
  Massachusetts: "MA",
  "New York": "NY",
  Texas: "TX",
  Washington: "WA",
};

function normalizeLocationPart(value: string): string {
  let part = normalizeText(value)
    .replace(/\s*\((?:US|USA|United States)\)\s*$/i, "")
    .replace(/\s+-\s+(?:US|USA|United States)\s*$/i, "")
    .replace(/,?\s+(?:US|USA|United States(?: of America)?)\s*$/i, "")
    .trim();

  if (/^(?:remote|remote anywhere|anywhere remote)$/i.test(part)) return "Remote";
  if (/^remote[- ]friendly\s*\(travel[- ]required\)$/i.test(part)) {
    return "Remote-friendly (travel)";
  }
  if (/^remote[- ]friendly$/i.test(part)) return "Remote-friendly";
  part = part.replace(/^New York City(?=,|$)/i, "New York");

  for (const [state, abbreviation] of Object.entries(LOCATION_ABBREVIATIONS)) {
    part = part.replace(new RegExp(`,\\s*${state}$`, "i"), `, ${abbreviation}`);
  }

  return part;
}

// ATS feeds often send a long list (sometimes with country names repeated).
// Keep the first meaningful place visible and summarize the rest for feed rows;
// the full source location remains available on the job detail screen.
export function formatJobLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const parts = location
    .split(/\s*(?:;|\||\s\/\s)\s*/)
    .map(normalizeLocationPart)
    .filter(Boolean);
  const unique = [...new Set(parts.map((part) => part.toLowerCase()))]
    .map((key) => parts.find((part) => part.toLowerCase() === key) as string);

  if (unique.length === 0) return null;
  if (unique.length === 1) return unique[0];

  const remoteIndex = unique.findIndex((part) => part === "Remote");
  if (remoteIndex >= 0) {
    return `Remote +${unique.length - 1}`;
  }
  if (unique.length === 2 && `${unique[0]} + ${unique[1]}`.length <= 34) {
    return `${unique[0]} + ${unique[1]}`;
  }
  return `${unique[0]} +${unique.length - 1}`;
}

// Some sources (notably Greenhouse) return descriptions as entity-encoded HTML
// (e.g. "&lt;p&gt;…&lt;/p&gt;"), which otherwise renders as literal "<p>" text.
// Decode once when we see encoded tags but no real tags. The guard prevents
// double-decoding content that is already real HTML.
function decodeEntitiesIfEncoded(html: string): string {
  if (!/&lt;\/?[a-z]/i.test(html)) return html;
  if (/<[a-z][\s\S]*>/i.test(html)) return html;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = html;
  return textarea.value;
}

const SALARY_PATTERNS = [
  /(?:(?:USD|CAD|GBP|EUR|AUD|SGD|CHF|JPY|NZD)\s*)?(?:\$|£|€|¥)\s*[\d,]+(?:\.\d{2})?(?:\s*[kK])?\s*(?:-|–|—|to)\s*(?:(?:USD|CAD|GBP|EUR|AUD|SGD|CHF|JPY|NZD)\s*)?(?:\$|£|€|¥)\s*[\d,]+(?:\.\d{2})?(?:\s*[kK])?/gi,
  /\$[\d,]+(?:\.\d{2})?(?:\s*[kK])?\s*(?:\/\s*(?:yr|year|annually|annual|hr|hour|hourly))/gi,
];

/* ATS feeds disagree on range punctuation ("$114,000 - $184,000",
   "$114,000—$184,000", "120K to 150K"); normalize every range to a bare
   en dash so adjacent feed rows always match. */
export function normalizeSalaryText(salary: string | null | undefined): string | null {
  if (!salary) return null;
  const cleaned = salary
    .replace(/\s+/g, " ")
    .replace(/\s*(?:[·•|]\s*)?offers?\s+equity\b[.!]?/gi, "")
    .replace(/^\s*[·•|]\s*|\s*[·•|]\s*$/g, "")
    .trim();
  if (!cleaned) return null;
  return cleaned
    .replace(/(\d[\d,.]*(?:\s?[kK])?)(?:\s+to\s+|\s*[-–—]\s*)([$£€¥]?\s?\d)/g, "$1–$2")
    .replace(/([$£€¥])\s+(\d)/g, "$1$2");
}

/** Compact feed-row pay without throwing away the precise detail-page value. */
export function formatCompactSalaryText(salary: string | null | undefined): string | null {
  const normalized = normalizeSalaryText(salary);
  if (!normalized) return null;

  // When an ATS supplies multiple geographic bands, keep the primary band in
  // the row; the full source value remains visible on the detail page.
  const primaryBand = normalized.split(/\s+[·•|]\s+/)[0] ?? normalized;
  return primaryBand.replace(/([$£€¥])?(\d{1,3}(?:,\d{3})+)(?:\.\d+)?/g, (_match: string, currency: string | undefined, amount: string) => {
    const thousands = Math.round(Number(amount.replace(/,/g, "")) / 1000);
    return `${currency ?? ""}${thousands}K`;
  });
}

export function extractSalaryFromHtml(html: string | null | undefined): string | null {
  if (!html) return null;
  const div = document.createElement("div");
  div.innerHTML = decodeEntitiesIfEncoded(html);
  const text = normalizeText(div.textContent ?? "");
  if (!text) return null;

  const matches: string[] = [];
  for (const pattern of SALARY_PATTERNS) {
    const found = text.match(pattern);
    if (!found) continue;
    for (const match of found) {
      const cleaned = normalizeText(match);
      const numbers = cleaned.match(/[\d,]+/g) ?? [];
      const maxValue = Math.max(...numbers.map((value) => parseInt(value.replace(/,/g, ""), 10)));
      if (Number.isFinite(maxValue) && maxValue >= 1000) {
        matches.push(cleaned);
      }
    }
  }

  const unique = [...new Set(matches)];
  if (unique.length === 0) return null;
  return unique.slice(0, 2).join(" · ");
}

export function extractPlainTextFromHtml(html: string | null | undefined): string {
  if (!html) return "";
  const div = document.createElement("div");
  div.innerHTML = decodeEntitiesIfEncoded(html);
  return normalizeText(div.textContent ?? "");
}

const ALLOWED_TAGS = new Set([
  "A",
  "B",
  "BR",
  "DIV",
  "EM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "I",
  "LI",
  "OL",
  "P",
  "SECTION",
  "SPAN",
  "STRONG",
  "U",
  "UL",
]);

const BLOCK_TAGS = new Set(["DIV", "P", "SECTION", "UL", "OL", "LI", "H1", "H2", "H3", "H4", "H5", "H6"]);

function unwrapElement(el: Element) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

function isBoilerplateBlock(text: string): boolean {
  return /equal opportunity|reasonable accommodation|pay transparency|privacy notice|applicant privacy|do not discriminate|diversity and inclusion|diversity, equity/i.test(text);
}

// Only treat a block as removable boilerplate when it is *mostly* boilerplate.
// Otherwise an outer container that merely contains an EEO paragraph (common with
// Greenhouse, which wraps the whole posting in one <div>) would delete the entire
// description. Containers that wrap substantial non-boilerplate content are kept;
// the boilerplate paragraphs inside them get removed individually.
function blockIsMostlyBoilerplate(el: Element): boolean {
  const text = normalizeText(el.textContent ?? "");
  if (!isBoilerplateBlock(text)) return false;
  for (const child of Array.from(
    el.querySelectorAll("p, li, ul, ol, div, section, h1, h2, h3, h4, h5, h6")
  )) {
    const childText = normalizeText(child.textContent ?? "");
    if (childText.length > 40 && !isBoilerplateBlock(childText)) {
      return false;
    }
  }
  return true;
}

function sanitizeUrl(value: string): string | null {
  try {
    const url = new URL(value, window.location.origin);
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
      return url.href;
    }
  } catch {
    return null;
  }
  return null;
}

const HEADING_ACRONYMS: Record<string, string> = {
  ai: "AI",
  api: "API",
  apis: "APIs",
  eeo: "EEO",
  ios: "iOS",
  ml: "ML",
  qa: "QA",
  sql: "SQL",
  sre: "SRE",
  ui: "UI",
  us: "US",
  usa: "USA",
  ux: "UX",
};

function humanizeAllCapsHeading(value: string): string {
  const text = normalizeText(value);
  const letters = [...text].filter((character) => /\p{L}/u.test(character)).join("");
  if (!letters || letters !== letters.toLocaleUpperCase() || letters === letters.toLocaleLowerCase()) {
    return text;
  }

  let firstWord = true;
  return text.toLocaleLowerCase().replace(/[\p{L}\p{N}]+/gu, (word) => {
    const replacement = HEADING_ACRONYMS[word]
      ?? (firstWord ? `${word.charAt(0).toLocaleUpperCase()}${word.slice(1)}` : word);
    firstWord = false;
    return replacement;
  }).replace(/\bR&d\b/g, "R&D");
}

export function sanitizeJobDescriptionHtml(
  html: string | null | undefined,
  context: { title?: string | null; companyName?: string | null } = {}
): string {
  if (!html) return "";

  const template = document.createElement("template");
  template.innerHTML = decodeEntitiesIfEncoded(html);

  template.content.querySelectorAll("script, style, iframe, object, embed, img, video, audio, form, input, button").forEach((el) => {
    el.remove();
  });

  for (const el of Array.from(template.content.querySelectorAll("*"))) {
    // Skip elements already removed via an ancestor in a previous iteration.
    if (!template.content.contains(el)) continue;

    if (BLOCK_TAGS.has(el.tagName) && blockIsMostlyBoilerplate(el)) {
      el.remove();
      continue;
    }

    if (!ALLOWED_TAGS.has(el.tagName)) {
      unwrapElement(el);
      continue;
    }

    // Capture the link target BEFORE stripping attributes — otherwise the href is
    // already gone and the link resolves to the app's own origin.
    const originalHref = el.tagName === "A" ? el.getAttribute("href") : null;

    for (const attr of Array.from(el.attributes)) {
      el.removeAttribute(attr.name);
    }

    if (el.tagName === "A") {
      const href = originalHref ? sanitizeUrl(originalHref) : null;
      if (href) {
        el.setAttribute("href", href);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      } else {
        unwrapElement(el);
      }
    }
  }

  template.content.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6").forEach((el) => {
    if (!normalizeText(el.textContent ?? "")) el.remove();
  });

  // This section label is already supplied by the app. Some ATS descriptions
  // repeat it after a short company introduction instead of at the first node.
  template.content.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((heading) => {
    if (isRepeatedDescriptionSectionLabel(heading.textContent ?? "")) {
      heading.remove();
      return;
    }
    const humanized = humanizeAllCapsHeading(heading.textContent ?? "");
    if (humanized !== normalizeText(heading.textContent ?? "")) heading.textContent = humanized;
  });

  // The page already establishes the role and its "About the role" section.
  // Remove only matching headings at the very start of the ATS content, while
  // preserving meaningful headings such as Responsibilities or Qualifications.
  while (true) {
    const firstTextNode = findFirstMeaningfulTextNode(template.content);
    const leadingHeading = firstTextNode?.parentElement?.closest("h1, h2, h3, h4, h5, h6");
    if (!leadingHeading || !isDuplicateLeadingJobHeading(leadingHeading.textContent ?? "", context)) break;
    leadingHeading.remove();
  }

  return template.innerHTML.trim();
}

function findFirstMeaningfulTextNode(root: Node): Text | null {
  for (const child of Array.from(root.childNodes)) {
    if (child.nodeType === 3 && normalizeText(child.textContent ?? "")) {
      return child as Text;
    }
    const nested = findFirstMeaningfulTextNode(child);
    if (nested) return nested;
  }
  return null;
}
